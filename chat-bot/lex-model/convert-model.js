#!/usr/bin/env node

const argv = require('yargs')
    .usage('Convert trivia API file to Amazon Lex model\nUsage: $0')
    .demandOption(['m'])
    .alias('m', 'api-model')
    .describe('m', 'trivia API file')
    .argv;

const converter = require('number-to-words');
const fs = require('fs');

const STRING_API_TYPE = 'STRING';
const NUMBER_API_TYPE = 'NUMBER';
const NUMBER_MODEL_TYPE = 'AMAZON.NUMBER';

// Assume it's a JSON file
const apiModel = require(argv.apiModel);
const lexModel = require('./lex-model-template');

// Convert API model to Lex model
// API model question ==> Lex Slot
// API model answer ==> Lex Slot Type
apiModel.forEach(function(category) {
    let categoryName = category.category;
    category.questions.forEach(function(question) {
        let slotName = converter.toWords(question.id);

        let slot = {
            name: slotName,
            slotConstraint: "Optional", // Let the Lambda function drive the order of conversation
            valueElicitationPrompt: {
                messages: [
                    {
                        "contentType": "PlainText",
                        "content": question.question
                    }
                ],
                maxAttempts: 2
            },
            priority: question.id,
            sampleUtterances: [] // TODO what is this??
        };

        if (question.answerType == NUMBER_API_TYPE) {
            slot.slotType = NUMBER_MODEL_TYPE;
        } else if (question.answerType == STRING_API_TYPE) {
            let slotTypeName = `Type${slotName}`;
            let slotType = {
                name: slotTypeName,
                version: "1",
                enumerationValues: [
                    {
                        value: question.answer,
                        synonyms: question.alternativeAnswers
                    }
                ],
                valueSelectionStrategy: 'TOP_RESOLUTION'
            };
            lexModel.resource.slotTypes.push(slotType);

            slot.slotType = slotTypeName;
            slot.slotTypeVersion = "1";
        } else {
            console.log(`Unrecognized answer type: ${question.answerType}`);
            process.exit(1);
        }

        lexModel.resource.intents[0].slots.push(slot);
    });
});

// TODO fill in code hook ARNs


fs.writeFileSync('./lex-model.json', JSON.stringify(lexModel, null, 2) , 'utf-8');