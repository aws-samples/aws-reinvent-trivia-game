var synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const axios = require('axios');

const PAGE_URL = "https://test.reinvent-trivia.com";
const API_ENDPOINT = "https://api-test.reinvent-trivia.com/"

const loadPage = async function () {
    let page = await synthetics.getPage();
    const response = await page.goto(PAGE_URL, {waitUntil: 'domcontentloaded', timeout: 10000});
    await page.waitFor(5000);
    await synthetics.takeScreenshot('loaded', 'loaded');
    let pageTitle = await page.title();
    log.info('Page title: ' + pageTitle);
    if (response.status() !== 200) {
        throw "Failed to load page!";
    }
};

const getAllQuestionsApi = async function () {
    log.info("Getting all questions");
    const response = await axios({
        url: '/api/trivia/all',
        method: 'get',
        baseURL: API_ENDPOINT,
        headers: {
            'User-Agent': synthetics.getCanaryUserAgentString()
        }
    });
    log.info("Response:");
    log.info(response);
    if (response.status != 200) {
        throw "Failed to load questions!";
    } else if (response.data.length != 4) {
        throw "Wrong number of categories!";
    }
};

const getQuestionApi = async function () {
    log.info("Getting question 1");
    const response = await axios({
        url: '/api/trivia/question/1',
        method: 'get',
        baseURL: API_ENDPOINT,
        headers: {
            'User-Agent': synthetics.getCanaryUserAgentString()
        }
    });
    log.info("Response:");
    log.info(response);
    if (response.status != 200 ||
        response.data.question != "What year was the first AWS re:Invent held?") {
        throw "Failed to load question!";
    }
};

const answerQuestionApi = async function () {
    log.info("Answering question 1");
    const response = await axios({
        url: '/api/trivia/question/1',
        method: 'post',
        baseURL: API_ENDPOINT,
        headers: {
            'User-Agent': synthetics.getCanaryUserAgentString()
        },
        data: {
            answer: '2012'
        }
    });
    log.info("Response:");
    log.info(response);
    if (response.status != 200 ||
        !response.data.result) {
        throw "Failed to answer question!";
    }
};

exports.handler = async () => {
    await loadPage();
    await getAllQuestionsApi();
    await getQuestionApi();
    await answerQuestionApi();
};
