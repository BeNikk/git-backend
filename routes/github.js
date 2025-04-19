const express = require("express");
const router = express.Router();
const githubController = require("../controllers/githubController");

router.get('/',(req,res)=>{
    res.json({message:"Hello world"});
})
router.post("/init", githubController.initRepository);
router.post("/fork", githubController.forkRepository);
router.post("/edit", githubController.editRepository);
router.post("/download-repo", githubController.downloadRepository);
router.post("/create-pr", githubController.createPullRequest);
router.post("/create-issue", githubController.createIssue);
router.get("/previous-commits", githubController.getPreviousCommits);
router.post("/create-branch", githubController.createBranch);
router.post("/get-all-branches", githubController.getAllBranches);
router.get("/repos", githubController.getRepositories);

module.exports = router;