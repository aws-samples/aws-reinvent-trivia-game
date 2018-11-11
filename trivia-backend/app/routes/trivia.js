const express = require('express');
const questions = require('../../data/questions.json');

const router = express.Router();

router.get('/all', function(req, res, next) {
  res.send(questions);
});

router.post('/check-answer/:question_id', function(req, res, next) {
  var id = req.params.question_id;
  var answer = req.body.answer;

  var isCorrect = false;
  questions.forEach(function(category) {
    category.questions.forEach(function(question) {
        if (question.id == id && question.answer == answer) {
          isCorrect = true;
        }
    });
  });

  res.json({ "correct" : isCorrect });
});

module.exports = router;
