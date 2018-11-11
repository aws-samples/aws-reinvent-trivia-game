'use strict';

const assert = require('assert');
const aws = require('aws-sdk');
const codedeploy = new aws.CodeDeploy();
const lambda = new aws.Lambda();

const TARGET_FUNCTION = process.env.CurrentVersion;

const TESTS = ['intro', 'one', 'four', 'final'];

exports.handler = async function (event, context, callback) {

    console.log("Entering PreTraffic Hook!");
    console.log(JSON.stringify(event));

    // Read the DeploymentId from the event payload.
    var deploymentId = event.DeploymentId;
    console.log("Deployment: " + deploymentId);

    // Read the LifecycleEventHookExecutionId from the event payload
    var lifecycleEventHookExecutionId = event.LifecycleEventHookExecutionId;
    console.log("LifecycleEventHookExecutionId: " + lifecycleEventHookExecutionId);

    // Prepare the validation test results with the deploymentId and
    // the lifecycleEventHookExecutionId for AWS CodeDeploy.
    var params = {
        deploymentId: deploymentId,
        lifecycleEventHookExecutionId: lifecycleEventHookExecutionId,
        status: 'Succeeded'
    };

    // Perform validation or pre-warming steps.
    // Invoke the function against sample inputs and validate the results.
    for (const test of TESTS) {
        let testInput = require(`./test-events/${test}.json`);
        let testExpectedOutput = require(`./test-events/${test}.expected.json`);

        console.log(`Testing ${test} against ${TARGET_FUNCTION}`);

        try {
            let data = await lambda.invoke({
                FunctionName: TARGET_FUNCTION,
                Payload: JSON.stringify(testInput)
            }).promise();

            assert.deepEqual(data.Payload, testExpectedOutput, `Unexpected results for ${test}`);
        } catch (err) {
            console.log(err);
            params.status = 'Failed';
        }
    }

    // Pass AWS CodeDeploy the prepared validation test results.
    codedeploy.putLifecycleEventHookExecutionStatus(params, function (err, data) {
        if (err) {
            // Validation failed.
            console.log('Validation test failed');
            console.log(err);
            console.log(data);
            callback('Validation test failed');
        } else {
            // Validation succeeded.
            console.log('Validation test succeeded');
            callback(null, 'Validation test succeeded');
        }
    });
}
