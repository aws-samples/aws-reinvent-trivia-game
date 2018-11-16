const express = require('express');
const questions = require('../../data/questions.json');

const router = express.Router();

/**
 * @api {get} api/trivia/all Get all questions
 * @apiName GetAllQuestions
 * @apiGroup TriviaAPI
 *
 * @apiSuccess {Object[]} categories Array of categories.
 * @apiSuccess {String} categories.category Category name.
 * @apiSuccess {Object[]} categories.questions This category's questions.
 * @apiSuccess {Number} categories.questions.id Unique id of the question.
 * @apiSuccess {Number} categories.questions.points How many points the question is worth.
 * @apiSuccess {String} categories.questions.question  Question text.
 * @apiSuccess {Object} categories.questions.answer  Question answer text.
 * @apiSuccess {String} categories.questions.answerType Type of the answer (NUMBER or STRING).
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *     [
 *         {
 *             "category": "Know Your History",
 *             "questions": [
 *                 {
 *                     "id": 1,
 *                     "points": 100,
 *                     "question": "What year was the first AWS re:Invent held?",
 *                     "answer": 2012,
 *                     "answerType": "NUMBER"
 *                 }
 *             ]
 *         }
 *     ]
 *
 * @apiExample {curl} Example usage:
 *     curl -i https://api.reinvent-trivia.com/api/trivia/all
 */
router.get('/all', function(req, res, next) {
  res.send(questions);
});

/**
 * @api {get} api/trivia/question/:id Request question
 * @apiName GetQuestion
 * @apiGroup TriviaAPI
 *
 * @apiParam {Number} id Question unique ID.
 *
 * @apiSuccess {Number} id Unique id of the question.
 * @apiSuccess {Number} points How many points the question is worth.
 * @apiSuccess {String} question  Question text.
 * @apiSuccess {Object} answer  Question answer text.
 * @apiSuccess {String} answerType Type of the answer (NUMBER or STRING).
 * @apiSuccess {String} category The question's category.
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       "id": 1,
 *       "points": 100,
 *       "question": "What year was the first AWS re:Invent held?",
 *       "answer": 2012,
 *       "answerType": "NUMBER"
 *     }
 *
 * @apiError QuestionNotFound 404 The id of the question was not found.
 *
 * @apiErrorExample QuestionNotFound:
 *     HTTP/1.1 404 Not Found
 *     {
 *       'error': 'Not Found'
 *     }
 *
 * @apiExample {curl} Example usage:
 *     curl -i https://api.reinvent-trivia.com/api/trivia/question/1
 */
router.get('/question/:question_id', function(req, res, next) {
  var id = req.params.question_id;

  var foundQuestion;
  questions.forEach(function(category) {
    category.questions.forEach(function(question) {
        if (question.id == id) {
          foundQuestion = question;
          foundQuestion.category = category.category;
        }
    });
  });

  if (foundQuestion) {
    res.json(foundQuestion);
  } else {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  }
});

/**
 * @api {post} api/trivia/question/:id Answer question
 * @apiName AnswerQuestion
 * @apiGroup TriviaAPI
 *
 * @apiParam {Number} id Question unique ID.
 * @apiParam {String} answer Question answer.
 * @apiParamExample {json} Request Body Example:
 *     {
 *       'answer': 'Broomball'
 *     }
 *
 * @apiSuccess {Number} id Unique id of the question.
 * @apiSuccess {Boolean} result Whether the given answer was correct (true/false).
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       'id': 1,
 *       'result': true
 *     }
 *
 * @apiError QuestionNotFound The id of the question was not found.
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found
 *     {
 *       'error': 'Not Found'
 *     }
 * @apiExample {curl} Example usage:
 *     curl -H "Content-Type: application/json" \
 *          -d "{'answer' : 'Broomball'}" \
 *          -X POST https://api.reinvent-trivia.com/api/trivia/question/1
 */
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
    if (foundQuestion.answerType == 'STRING' && typeof answer === 'string') {
      answer = parseInt(answer, 10);
    }

    var isCorrect = (foundQuestion.answer == answer);
    res.json({ "result" : isCorrect, "id": id });
  } else {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  }
});

module.exports = router;
