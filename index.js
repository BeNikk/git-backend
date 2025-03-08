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

        fs.writeFileSync(path.join(repoPath, "projectData.json"), JSON.stringify(fileContent, null, 2));

        const metadata = {
            hashedKey,
            createdAt: new Date().toISOString(),
            repoName,
            repoUrl,
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
        const metadata = {
            repoName: newRepoName,
            secretKey: newSecretKey,
            createdAt: new Date().toISOString(),
            originalRepo: repoUrl,
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