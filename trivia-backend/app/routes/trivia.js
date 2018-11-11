const express = require('express');
const questions = require('../../data/questions.json');

const router = express.Router();

router.get('/all', function(req, res, next) {
  res.send(questions);
});

// Return question content
router.get('/question/:question_id', function(req, res, next) {
  var id = req.params.question_id;

  var foundQuestion;
  questions.forEach(function(category) {
    category.questions.forEach(function(question) {
        if (question.id == id) {
          foundQuestion = question;
        }
    });
  });

  if (foundQuestion) {
    res.json({ "question" : foundQuestion.question });
  } else {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  }
});

// Post answer to question, get result (true/false) back
router.post('/question/:question_id', function(req, res, next) {
  var id = req.params.question_id;
  var answer = req.body.answer;

  var foundQuestion;
  questions.forEach(function(category) {
    category.questions.forEach(function(question) {
        if (question.id == id) {
          foundQuestion = question;
        }
    });
  });

  if (foundQuestion) {
    var isCorrect = (foundQuestion.answer == answer);
    res.json({ "result" : isCorrect });
  } else {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  }
});

module.exports = router;
