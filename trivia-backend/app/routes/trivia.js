const express = require('express');
const questions = require('../../data/questions.json');

const router = express.Router();

router.get('/all', function(req, res, next) {
  res.send(questions);
});

module.exports = router;
