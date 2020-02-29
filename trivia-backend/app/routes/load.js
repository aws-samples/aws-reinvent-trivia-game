const express = require('express');

const router = express.Router();

/**
 * @api {get} api/load Generate CPU-intensive load
 * @apiName GenerateLoad
 * @apiGroup LoadAPI
 *
 * @apiSuccess {Number} result Number computed.
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *         "result": 1234
 *     }
 *
 * @apiExample {curl} Example usage:
 *     curl -i https://api.reinvent-trivia.com/api/load
 */
router.get('/', function(req, res, next) {
  var now = new Date().getTime();
  var result = 0;
  // block for 1 second with pointless computations
	while(true) {
		result += Math.random() * Math.random();
		if (new Date().getTime() > now + 1000) {
      break;
    }
	}

  res.send({ result: result });
});

module.exports = router;
