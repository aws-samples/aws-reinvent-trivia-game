'use strict';

const aws = require('aws-sdk');
const axios = require('axios');
const codedeploy = new aws.CodeDeploy();

const TARGET_URL = process.env.TargetUrl;

function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

exports.handler = async function (event, context, callback) {

    console.log("Entering PreTraffic Hook!");
    console.log(JSON.stringify(event));

    // Read the DeploymentId from the event payload.
    var deploymentId = event.DeploymentId;
    console.log("Deployment: " + deploymentId);

    // Read the LifecycleEventHookExecutionId from the event payload
    var lifecycleEventHookExecutionId = event.LifecycleEventHookExecutionId;
    console.log("LifecycleEventHookExecutionId: " + lifecycleEventHookExecutionId);

    // Ensure test traffic is fully shifted over to new target group
    console.log("Waiting 30 seconds");
    await sleep(30);

    // Prepare the validation test results with the deploymentId and
    // the lifecycleEventHookExecutionId for AWS CodeDeploy.
    var params = {
        deploymentId: deploymentId,
        lifecycleEventHookExecutionId: lifecycleEventHookExecutionId,
        status: 'Succeeded'
    };

    // Perform validation or pre-warming steps.
    // Make a request to the target URL and check the response
    try {
        console.log("Target: " + TARGET_URL);
        const response = await axios(TARGET_URL);
        console.log("Response:");
        console.log(response);
        if (response.status != 200) {
            console.error("Failure status");
            params.status = 'Failed';
        } else if (response.data.length != 4) {
            console.error("Wrong number of categories");
            params.status = 'Failed';
        }
    } catch (err) {
        console.error(err);
        params.status = 'Failed';
    }

    // Pass AWS CodeDeploy the prepared validation test results.
    try {
        console.log(params);
        await codedeploy.putLifecycleEventHookExecutionStatus(params).promise();
        console.log('Successfully reported hook results');
        callback(null, 'Successfully reported hook results');
    } catch (err) {
        console.error('Failed to report hook results');
        console.error(err);
        callback('Failed to report hook results');
    }
}
