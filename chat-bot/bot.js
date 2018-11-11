const axios = require('axios');
const numToWords = require('number-to-words');

const API_ENDPOINT = process.env.API_ENDPOINT;

const MAX_QUESTIONS = 16;

function elicitSlot(sessionAttributes, intentName, slots, slotToElicit, message) {
    return {
        sessionAttributes,
        dialogAction: {
            type: 'ElicitSlot',
            intentName,
            slots,
            slotToElicit,
            message,
        },
    };
}

function close(sessionAttributes, fulfillmentState, message) {
    return {
        sessionAttributes,
        dialogAction: {
            type: 'Close',
            fulfillmentState,
            message,
        },
    };
}

// Get new question from backend
async function getQuestion(id) {
    const url = API_ENDPOINT + '/api/trivia/question/' + id;
    console.log('Requesting ' + url);
    return await axios.get(url);
}

// Ask the first question
async function startGame(intentRequest) {
    // Start of the game
    const sessionAttributes = {
        started: true,
        currentQuestion: 1,
        currentScore: 0
    };

    const firstQuestion = await getQuestion(1);

    var message = {
        contentType: 'PlainText',
        content: "Let's play re:Invent Trivia! " + firstQuestion.data.question
    };

    return elicitSlot(sessionAttributes, intentRequest.currentIntent.name,
        intentRequest.currentIntent.slots, "one", message);
}

// Check the answer to the previous question and ask the next question
async function nextQuestion(intentRequest) {
    var sessionAttributes = intentRequest.sessionAttributes;
    var score = sessionAttributes.currentScore;
    var currentQuestionId = sessionAttributes.currentQuestion;
    var currentSlot = numToWords.toWords(currentQuestionId);

    const currentQuestionData = await getQuestion(currentQuestionId);

    var nextQuestionId = currentQuestionId + 1;
    var nextSlot = numToWords.toWords(nextQuestionId);

    // Check the answer, add to score if correct
    // TODO
    // sessionAttributes.score += 100;

    const newQuestionData = await getQuestion(nextQuestionId);

    var message = {
        contentType: 'PlainText',
        content: "Next question! " + newQuestionData.data.question
    };

    sessionAttributes.currentQuestion = nextQuestionId;
    sessionAttributes.currentSlot = nextSlot;

    return elicitSlot(sessionAttributes, intentRequest.currentIntent.name,
        intentRequest.currentIntent.slots, nextSlot, message);
}

// Check answer to final question and finish the game
async function finishGame(intentRequest) {
    var sessionAttributes = intentRequest.sessionAttributes;
    var score = sessionAttributes.currentScore;
    var currentQuestionId = sessionAttributes.currentQuestion;
    var currentSlot = numToWords.toWords(currentQuestionId);

    const currentQuestionData = await getQuestion(currentQuestionId);

    // Check the answer, add to score if correct
    // TODO
    // sessionAttributes.score += 100;

    var message = {
        contentType: 'PlainText',
        content: "Thanks for playing! Your final score is " + sessionAttributes.currentScore
    };

    return close(sessionAttributes, 'Fulfilled', message);
}

// Move the game forward, based on state stored in the session attributes
async function playGame(intentRequest) {
    const sessionAttributes = intentRequest.sessionAttributes || {};
    const slots = intentRequest.currentIntent.slots;

    if (Object.keys(sessionAttributes).length == 0) {
        return await startGame(intentRequest);
    } else if (sessionAttributes.currentQuestion < MAX_QUESTIONS) {
        return await nextQuestion(intentRequest);
    } else {
        return await finishGame(intentRequest);
    }
}

// Route the incoming request based on intent.
// The JSON body of the request is provided in the event slot.
exports.handler = async function(event, context, callback) {
    try {
        console.log("Request: " + JSON.stringify(event));
        const intentName = event.currentIntent.name;

        if (intentName === 'LetsPlay') {
            const response = await playGame(event);
            callback(null, response);
        } else {
            throw new Error(`Intent with name ${intentName} not supported`);
        }
    } catch (err) {
        callback(err);
    }
};
