const axios = require('axios');
const numToWords = require('number-to-words');

const API_ENDPOINT = process.env.API_ENDPOINT;

const MAX_QUESTIONS = 16;

/**
 * This function is used as a fulfillment hook for an Amazon Lex bot.
 * It is responsible for driving the conversation including which
 * questions to ask, validating the user's answers, and keeping track
 * of the user's score.  All state is tracked in the session attributes.
 */

// Helper functions for returning results back to Lex
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
    console.log('Requesting (GET) ' + url);
    return await axios.get(url);
}

// Post answer to backend
async function answerQuestion(id, answer) {
    const url = API_ENDPOINT + '/api/trivia/question/' + id;
    console.log('Requesting (POST) ' + url);
    return await axios.post(url, { answer });
}

// Ask the first question
async function startGame(intentRequest) {
    // Start of the game
    const sessionAttributes = {
        started: true,
        currentQuestion: 1,
        currentSlot: "one",
        currentScore: 0,
    };

    const firstQuestion = await getQuestion(1);

    var message = {
        contentType: 'PlainText',
        content: "Let's play re:Invent Trivia! " +
            "The game covers four categories with four questions each. " +
            `Starting with the "${firstQuestion.data.category}" category, ` +
            `for ${firstQuestion.data.points} points: ${firstQuestion.data.question}`
    };

    return elicitSlot(sessionAttributes, intentRequest.currentIntent.name,
        intentRequest.currentIntent.slots, "one", message);
}

// Check the answer to the previous question and ask the next question
async function nextQuestion(intentRequest) {
    var sessionAttributes = intentRequest.sessionAttributes;
    var score = parseInt(sessionAttributes.currentScore, 10);
    var currentQuestionId = parseInt(sessionAttributes.currentQuestion, 10);
    var currentSlot = numToWords.toWords(currentQuestionId);

    const currentQuestionData = await getQuestion(currentQuestionId);

    var nextQuestionId = currentQuestionId + 1;
    var nextSlot = numToWords.toWords(nextQuestionId);

    // Check the answer, add to score if correct
    var isCorrect = false;
    var userAnswer = intentRequest.currentIntent.slots[currentSlot];
    // null user answer means a string response did not match any of the sample utterances
    if (userAnswer) {
        const answerData = await answerQuestion(currentQuestionId, userAnswer);
        isCorrect = answerData.data.result;
    }

    var messageContent = "";

    if (isCorrect) {
        score += currentQuestionData.data.points;
        messageContent += "That is correct! New score is " + score + " points! ";
    } else {
        messageContent += `Incorrect! The correct answer is "${currentQuestionData.data.answer}". `;
    }

    const newQuestionData = await getQuestion(nextQuestionId);
    if (currentQuestionData.data.category != newQuestionData.data.category) {
        messageContent += `Moving on the "${newQuestionData.data.category}" category. `
    }
    messageContent += `For ${newQuestionData.data.points} points: ${newQuestionData.data.question}`;

    var message = {
        contentType: 'PlainText',
        content: messageContent
    };

    sessionAttributes.currentQuestion = nextQuestionId;
    sessionAttributes.currentSlot = nextSlot;
    sessionAttributes.currentScore = score;

    return elicitSlot(sessionAttributes, intentRequest.currentIntent.name,
        intentRequest.currentIntent.slots, nextSlot, message);
}

// Check answer to final question and finish the game
async function finishGame(intentRequest) {
    var sessionAttributes = intentRequest.sessionAttributes;
    var score = parseInt(sessionAttributes.currentScore, 10);
    var currentQuestionId = parseInt(sessionAttributes.currentQuestion, 10);
    var currentSlot = numToWords.toWords(currentQuestionId);

    const currentQuestionData = await getQuestion(currentQuestionId);

    // Check the answer, add to score if correct
    var isCorrect = false;
    var userAnswer = intentRequest.currentIntent.slots[currentSlot];
    // null user answer means a string response did not match any of the sample utterances
    if (userAnswer) {
        const answerData = await answerQuestion(currentQuestionId, userAnswer);
        isCorrect = answerData.data.result;
    }

    var messageContent = "";

    if (isCorrect) {
        score += currentQuestionData.data.points;
        messageContent += "That is correct! ";
    } else {
        messageContent += "Incorrect! ";
    }
    messageContent += `Thanks for playing! Your final score is ${score} points`;

    var message = {
        contentType: 'PlainText',
        content: messageContent
    };

    return close(sessionAttributes, 'Fulfilled', message);
}

// Move the game forward, based on state stored in the session attributes
async function playGame(intentRequest) {
    const sessionAttributes = intentRequest.sessionAttributes || {};
    const slots = intentRequest.currentIntent.slots;

    if (Object.keys(sessionAttributes).length == 0) {
        return await startGame(intentRequest);
    } else if (parseInt(sessionAttributes.currentQuestion, 10) < MAX_QUESTIONS) {
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
