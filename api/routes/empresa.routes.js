const express = require("express");
const router = express.Router();
const empresa = require("../controllers/empresa.controller");
const auth = require("../middlewares/auth");

router.use(auth);

router.get("/", empresa.getAccesibles);
router.get("/:id", empresa.getById);
router.post("/", empresa.create);
router.put("/:id", empresa.update);
router.delete("/:id", empresa.delete);

module.exports = router;
