const express = require("express");
const cors = require("cors");
require('dotenv').config();
const simpleGit = require("simple-git");
const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = "BeNikk";

const app = express();
app.use(cors());
app.use(express.json());

const octokit = new Octokit({ auth: GITHUB_TOKEN });

function categorizeProjectTheme(projectData) {
    const blockCategories = {
        music: ["newnote", "osctime", "pitch", "playdrum", "hertz", "pitchnumber", "nthmodalpitch", "steppitch", "rest2", "tempo", "timbre", "musickeyboard", "interval", "definemode", "temperament", "voicename", "drumname", "effectsname", "filtertype", "oscillatortype", "modename", "chordname", "accidentalname", "noisename", "customNote"],
        art: ["draw", "color", "shape", "turtle", "penup", "pendown", "setcolor", "setwidth", "setposition", "setheading", "forward", "backward", "right", "left", "arc", "circle", "rectangle", "triangle", "polygon", "stamp", "clear"],
        math: ["add", "subtract", "multiply", "divide", "mod", "sqrt", "pow", "abs", "round", "floor", "ceil", "random", "min", "max", "sin", "cos", "tan", "asin", "acos", "atan", "log", "exp", "pi", "e", "greater", "less", "equal", "notequal", "and", "or", "not", "true", "false"],
        general: ["start", "action", "repeat", "if", "else", "wait", "forever", "stop", "print", "input", "variable", "setvariable", "getvariable", "list", "addtolist", "removefromlist", "lengthoflist", "itemoflist", "clearlist", "function", "callfunction", "return"]
    };

    const blocks = JSON.parse(projectData);
    const themeCounts = { music: 0, art: 0, math: 0, general: 0 };

    blocks.forEach(block => {
        let blockName = Array.isArray(block[1]) ? block[1][0] : block[1]; 

        for (const [theme, themeBlocks] of Object.entries(blockCategories)) {
            if (themeBlocks.includes(blockName)) {
                themeCounts[theme]++;
                break; 
            }
        }
    });

    const sortedThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);
    return sortedThemes[0][1] > 0 ? sortedThemes[0][0] : "unknown"; 
}

app.post("/init", async (req, res) => {
    const { fileContent } = req.body;

    if (!fileContent) {
        return res.status(400).json({ message: "File content is required" });
    }

    const uniqueId = Date.now();
    const repoName = `musicblocks-${uniqueId}`;

    const secretKey = crypto.randomBytes(32).toString("hex");
    const hashedKey = crypto.createHash("sha256").update(secretKey).digest("hex");

    try {
        const response = await octokit.repos.createForAuthenticatedUser({
            name: repoName,
            private: false,  
        });

        const repoUrl = response.data.clone_url;
        console.log("GitHub repo created:", repoUrl);

        const repoPath = path.join(__dirname, repoName);
        if (!fs.existsSync(repoPath)) fs.mkdirSync(repoPath);
        const git = simpleGit(repoPath);
        await git.init();
        const projectTheme = categorizeProjectTheme(fileContent);

        fs.writeFileSync(path.join(repoPath, "projectData.json"), JSON.stringify(fileContent, null, 2));

        const metadata = {
            hashedKey,
            createdAt: new Date().toISOString(),
            repoName,
            repoUrl,
            projectTheme:projectTheme
        };

        fs.writeFileSync(path.join(repoPath, "metadata.json"), JSON.stringify(metadata, null, 2));

        await git.add(".");
        await git.commit("Initial commit");
        await git.addRemote("origin", repoUrl);
        await git.branch(["-M", "main"]);
        await git.push("origin", "main");

        res.json({ 
            message: `Repository '${repoName}' created and pushed successfully!`, 
            repoUrl,
            secretKey,  
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Failed to create repository", error: error.message });
    }
});

app.post("/fork", async (req, res) => {
    const { repoUrl } = req.body;
    if (!repoUrl) return res.status(400).json({ message: "GitHub repository URL is required" });

    const uniqueId = Date.now();
    const newRepoName = `musicblocks/fork-${uniqueId}`;
    const newSecretKey = crypto.randomBytes(16).toString("hex");

    try {
        const repoPath = path.join(__dirname, newRepoName);
        await simpleGit().clone(repoUrl, repoPath);

        const metadataPath = path.join(repoPath, "metadata.json");
        let projectTheme = "general";
        if (fs.existsSync(metadataPath)) {
            const originalMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
            if (originalMetadata.projectTheme) {
                projectTheme = originalMetadata.projectTheme;
            }
        }

        const metadata = {
            repoName: newRepoName,
            secretKey: newSecretKey,
            createdAt: new Date().toISOString(),
            originalRepo: repoUrl,
            projectTheme
        };
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        const response = await octokit.repos.createForAuthenticatedUser({
            name: newRepoName,
            private: false,
        });

        const newRepoUrl = response.data.clone_url;
        console.log("Forked GitHub repo created:", newRepoUrl);

        const git = simpleGit(repoPath);

        await git.removeRemote("origin").catch(() => console.log("No existing remote to remove."));

        await git.addRemote("origin", newRepoUrl);
        await git.add(".");
        await git.commit("Forked project with updated metadata");
        await git.branch(["-M", "main"]);
        await git.push("origin", "main");

        const projectData = fs.readFileSync(path.join(repoPath, "projectData.json"), "utf-8");

        res.json({
            message: `Forked repository '${newRepoName}' created successfully!`,
            repoUrl: newRepoUrl,
            secretKey: newSecretKey,
            projectData: JSON.parse(projectData),
        });
    } catch (error) {
        console.error("Forking error:", error);
        res.status(500).json({ message: "Failed to fork repository", error: error.message });
    }
});

app.listen(5000,()=>{console.log(`server running at port ${5000}`)})