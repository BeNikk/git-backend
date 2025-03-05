const express = require("express");
const cors = require("cors");
require('dotenv').config();
const simpleGit = require("simple-git");
const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const path = require("path");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = "BeNikk";

const app = express();
app.use(cors());
app.use(express.json());

const octokit = new Octokit({ auth: GITHUB_TOKEN });

app.post("/init", async (req, res) => {
    const { repoName, fileContent } = req.body;
    
    if (!fileContent) {
        return res.status(400).json({ message: "file content are required" });
    }
    if(!repoName){
        repoName = "MUSIC BLOCKS PROJECT";
    }

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
        fs.writeFileSync(path.join(repoPath, "project.json"), fileContent);
        await git.add(".");
        await git.commit("Initial commit");

        await git.addRemote("origin", repoUrl);
        await git.branch(["-M", "main"]);
        await git.push("origin", "main");

        res.json({ message: `Repository '${repoName}' created and pushed successfully!`, repoUrl });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Failed to create repository", error: error.message });
    }
});

app.post("/fork", async (req, res) => {
    try {
        const { repoUrl } = req.body;

        const urlParts = repoUrl.split("/");
        const owner = urlParts[urlParts.length - 2];
        const repo = urlParts[urlParts.length - 1];

        const forkResponse = await octokit.repos.createFork({
            owner,
            repo
        });

        res.json({ 
            message: `Repository forked successfully!`, 
            forkedRepoUrl: forkResponse.data.html_url 
        });
    } catch (error) {
        console.error("Forking failed:", error);
        res.status(500).json({ message: "Forking failed", error: error.message });
    }
});
app.listen(5000,()=>{console.log(`server running at port ${5000}`)})