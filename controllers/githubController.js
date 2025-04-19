const { Octokit } = require("@octokit/rest");
const simpleGit = require("simple-git");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const archiver = require("archiver");
const { categorizeProjectTheme } = require("../utils/themeCategorizer");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const GITHUB_USERNAME = "BeNikk";

module.exports = {
    async initRepository(req, res) {
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

            const repoPath = path.join(__dirname, "..", repoName);
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
                projectTheme,
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
    },

    async forkRepository(req, res) {
        const { repoUrl } = req.body;
        if (!repoUrl) return res.status(400).json({ message: "GitHub repository URL is required" });

        const uniqueId = Date.now();
        const newRepoName = `musicblocks/fork-${uniqueId}`;
        const newSecretKey = crypto.randomBytes(16).toString("hex");

        try {
            const repoPath = path.join(__dirname, "..", newRepoName);
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
                projectTheme,
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
    },

    async editRepository(req, res) {
        const { repoUrl, secretKey, newFileContent } = req.body;

        if (!repoUrl || !secretKey || !newFileContent) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        try {
            const repoName = repoUrl.split("/").pop().replace(".git", "");
            const repoPath = path.join(__dirname, "..", repoName);

            if (fs.existsSync(repoPath)) {
                fs.rmSync(repoPath, { recursive: true, force: true });
            }

            const git = simpleGit();
            await git.clone(repoUrl, repoPath);
            console.log(`Cloned repository: ${repoUrl}`);

            const metadataPath = path.join(repoPath, "metadata.json");
            if (!fs.existsSync(metadataPath)) {
                return res.status(400).json({ message: "Metadata file not found" });
            }

            const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
            const hashedInputKey = crypto.createHash("sha256").update(secretKey).digest("hex");

            if (metadata.hashedKey !== hashedInputKey) {
                fs.rmSync(repoPath, { recursive: true, force: true });
                return res.status(403).json({ message: "Invalid secret key" });
            }

            const newProjectTheme = categorizeProjectTheme(newFileContent);
            metadata.projectTheme = newProjectTheme;

            fs.writeFileSync(path.join(repoPath, "projectData.json"), JSON.stringify(newFileContent, null, 2));
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

            const gitRepo = simpleGit(repoPath);
            await gitRepo.add(".");
            await gitRepo.commit("Updated project data");
            await gitRepo.push("origin", "main");

            fs.rmSync(repoPath, { recursive: true, force: true });

            res.json({
                message: `Repository '${repoName}' updated successfully!`,
                newProjectTheme,
            });
        } catch (error) {
            console.error("Error:", error);
            res.status(500).json({ message: "Failed to update repository", error: error.message });
        }
    },

    async downloadRepository(req, res) {
        const { repoUrl } = req.body;

        if (!repoUrl) {
            return res.status(400).json({ message: "Repository URL is required" });
        }

        const repoName = repoUrl.split("/").pop().replace(".git", "");
        const tempDir = path.join(__dirname, "..", "temp", repoName);

        try {
            if (!fs.existsSync(path.join(__dirname, "..", "temp"))) {
                fs.mkdirSync(path.join(__dirname, "..", "temp"));
            }

            console.log(`Cloning ${repoUrl}...`);
            await simpleGit().clone(repoUrl, tempDir);

            const zipFilePath = path.join(__dirname, "..", "temp", `${repoName}.zip`);
            const output = fs.createWriteStream(zipFilePath);
            const archive = archiver("zip", { zlib: { level: 9 } });

            output.on("close", () => {
                console.log(`ZIP created: ${zipFilePath}`);

                res.download(zipFilePath, `${repoName}.zip`, (err) => {
                    if (err) console.error("Error sending file:", err);

                    execSync(`rm -rf ${tempDir}`);
                    fs.unlinkSync(zipFilePath);
                    console.log("Cleanup complete.");
                });
            });

            archive.on("error", (err) => {
                throw err;
            });

            archive.pipe(output);
            archive.directory(tempDir, false);
            archive.finalize();

        } catch (error) {
            console.error("Error:", error);
            res.status(500).json({ message: "Failed to process repository", error: error.message });

            if (fs.existsSync(tempDir)) execSync(`rm -rf ${tempDir}`);
        }
    },

    async createPullRequest(req, res) {
        const { forkRepoUrl, baseRepo, title, description, changes } = req.body;

        if (!forkRepoUrl || !baseRepo || !title || !description || !changes) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const repoName = forkRepoUrl.split("/").pop().replace(".git", "");
        const repoPath = path.join(__dirname, "..", "temp", repoName);
        const branchName = `pr-${Date.now()}`;

        try {
            if (fs.existsSync(repoPath)) {
                fs.rmSync(repoPath, { recursive: true, force: true });
            }

            console.log(`Cloning ${forkRepoUrl}...`);
            await simpleGit().clone(forkRepoUrl, repoPath);
            const git = simpleGit(repoPath);

            await git.checkoutLocalBranch(branchName);

            fs.writeFileSync(path.join(repoPath, "projectData.json"), JSON.stringify(changes, null, 2));

            await git.add(".");
            await git.commit(`Proposed changes: ${title}`);
            await git.push("origin", branchName);

            console.log("Creating pull request...");
            const prResponse = await octokit.pulls.create({
                owner: baseRepo.split("/")[0],
                repo: baseRepo.split("/")[1],
                title,
                head: `${GITHUB_USERNAME}:${branchName}`,
                base: "main",
                body: description,
            });

            res.json({
                message: "Pull request created successfully!",
                prUrl: prResponse.data.html_url,
            });

        } catch (error) {
            console.error("PR creation error:", error);
            res.status(500).json({ message: "Failed to create pull request", error: error.message });
        } finally {
            if (fs.existsSync(repoPath)) fs.rmSync(repoPath, { recursive: true, force: true });
        }
    },

    async createIssue(req, res) {
        const { baseRepo, title, description } = req.body;

        if (!baseRepo || !title || !description) {
            return res.status(400).json({ message: "Missing required fields." });
        }

        const baseRepoFormatted = baseRepo.replace("https://github.com/", "").replace(".git", "");
        const [owner, repo] = baseRepoFormatted.split("/");

        if (!owner || !repo) {
            return res.status(400).json({ message: "Invalid base repository format. Use 'owner/repo'." });
        }

        try {
            console.log(`Creating issue in ${owner}/${repo}...`);
            const issueResponse = await octokit.issues.create({
                owner,
                repo,
                title,
                body: description,
            });

            res.json({
                message: "Issue created successfully!",
                issueUrl: issueResponse.data.html_url,
            });

        } catch (error) {
            console.error("Issue creation error:", error);
            res.status(500).json({ message: "Failed to create issue.", error: error.message });
        }
    },

    async getPreviousCommits(req, res) {
        const { repoUrl } = req.query;

        if (!repoUrl) {
            return res.status(400).json({ message: "Repository URL is required" });
        }

        try {
            const repoName = repoUrl.split("/").pop().replace(".git", "");
            const repoPath = path.join(__dirname, "..", repoName);

            if (fs.existsSync(repoPath)) {
                fs.rmSync(repoPath, { recursive: true, force: true });
            }

            await simpleGit().clone(repoUrl, repoPath);
            const git = simpleGit(repoPath);

            const commits = await git.log();

            const commitData = [];

            for (const commit of commits.all) {
                await git.checkout(commit.hash);

                const projectDataPath = path.join(repoPath, "projectData.json");
                const metadataPath = path.join(repoPath, "metadata.json");

                let projectData = null;
                let metadata = null;

                if (fs.existsSync(projectDataPath)) {
                    projectData = JSON.parse(fs.readFileSync(projectDataPath, "utf-8"));
                }

                if (fs.existsSync(metadataPath)) {
                    metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
                }

                commitData.push({
                    commitHash: commit.hash,
                    message: commit.message,
                    date: commit.date,
                    author: commit.author_name,
                    projectData,
                    metadata,
                });
            }

            await git.checkout("main");
            fs.rmSync(repoPath, { recursive: true, force: true });
            res.json({ commits: commitData });
        } catch (error) {
            console.error("Error fetching previous commits:", error);
            res.status(500).json({ message: "Failed to fetch commit history", error: error.message });
        }
    },

    async createBranch(req, res) {
        const { repoUrl, branchName, projectData } = req.body;

        const tempDir = path.join(__dirname, "..", "temp-repo");

        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true });
            }

            await simpleGit().clone(repoUrl, tempDir);

            const git = simpleGit(tempDir);
            await git.checkoutLocalBranch(branchName);

            const dataFile = path.join(tempDir, "projectData.json");
            fs.writeFileSync(dataFile, JSON.stringify(projectData, null, 2), "utf-8");

            await git.add(".");
            await git.commit(`Created branch ${branchName} with updated project data`);
            await git.push("origin", branchName);

            fs.rmSync(tempDir, { recursive: true });

            res.json({ success: true, message: `Branch ${branchName} created and pushed.` });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, error: err.message });
        }
    },

    async getAllBranches(req, res) {
        const { repoUrl } = req.body;

        if (!repoUrl) {
            return res.status(400).json({ message: "Repository URL is required" });
        }

        try {
            const [owner, repo] = repoUrl
                .replace("https://github.com/", "")
                .replace(".git", "")
                .split("/");

            const branchesResponse = await octokit.repos.listBranches({
                owner,
                repo,
            });

            const branches = branchesResponse.data.map((b) => b.name);
            const results = [];

            for (const branch of branches) {
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/projectData.json`;

                try {
                    const response = await fetch(rawUrl);
                    if (!response.ok) throw new Error(`No projectData.json found in branch ${branch}`);
                    const projectData = await response.json();

                    results.push({ branchName: branch, projectData });
                } catch (err) {
                    console.log(`Skipped ${branch}:`, err.message);
                    results.push({ branchName: branch, projectData: null });
                }
            }

            res.json({ branches: results });
        } catch (error) {
            console.error("Error fetching branches:", error);
            res.status(500).json({ message: "Failed to fetch branches and project data", error: error.message });
        }
    },

    async getRepositories(req, res) {
        try {
            console.log("Fetching repositories...");
            const apiUrl = `https://api.github.com/users/${GITHUB_USERNAME}/repos`;
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error("Failed to fetch repositories");
            }

            const data = await response.json();

            const repos = data.map((repo) => ({
                name: repo.name,
                description: repo.description,
                html_url: repo.html_url,
                language: repo.language,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                created_at: repo.created_at,
                updated_at: repo.updated_at,
            }));

            res.json(repos);
        } catch (error) {
            console.error("Error fetching repositories:", error);
            res.status(500).json({ error: "Failed to fetch repositories" });
        }
    },
};