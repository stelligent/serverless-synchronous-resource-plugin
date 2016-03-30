'use strict';

let BbPromise = require('bluebird'),
    AWS = require('aws-sdk');


module.exports = CFNRunner;

function CFNRunner(region, templatePath) {
    this.cfnConfig = require('cfn-config');

    this.options = {
        "region": region,
        "force": true
    };

    var creds = this.setCredentials();

    this.awsConfig = {
        region: this.options.region,
        accessKeyId: creds[0],
        secretAccessKey: creds[1]
    };

    this.CloudFormation = BbPromise.promisifyAll(new AWS.CloudFormation(this.awsConfig), {suffix: "Promised"});

    this.options.template = templatePath;

    var pathTokens = templatePath.split("/");
    this.options.name = pathTokens[pathTokens.length - 1].split(".")[0];

}

CFNRunner.prototype.setCredentials = function () {
    var fs = require('fs');
    var credsFileContents = fs.readFileSync('admin.env', 'utf8');
    var lines = credsFileContents.split('\n');
    var aws_access_key_id;
    var aws_secret_access_key;
    lines.forEach(function (cv) {
        var kvPair = cv.split('=');
        var key = kvPair[0];
        var val = kvPair[1];
        if (key === 'SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID') {
            aws_access_key_id = val;
        }
        if (key === 'SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY') {
            aws_secret_access_key = val;
        }

    });
    this.cfnConfig.setCredentials(aws_access_key_id, aws_secret_access_key);
    return [aws_access_key_id, aws_secret_access_key];
};


CFNRunner.prototype.monitorStack = function (options, stackAction, cb) {
    require('colors');
    var colors = {
        "CREATE_IN_PROGRESS": 'yellow',
        "CREATE_FAILED": 'red',
        "CREATE_COMPLETE": 'green',
        "DELETE_IN_PROGRESS": 'yellow',
        "DELETE_FAILED": 'red',
        "DELETE_COMPLETE": 'grey',
        "DELETE_SKIPPED": 'grey',
        "UPDATE_IN_PROGRESS": 'yellow',
        "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS": 'yellow',
        "UPDATE_FAILED": 'red',
        "UPDATE_COMPLETE": 'green',
        "ROLLBACK_IN_PROGRESS": 'red',
        "ROLLBACK_COMPLETE": 'red'
    };
    var cfn = new AWS.CloudFormation(this.awsConfig);

    var EventStream = require('cfn-stack-event-stream');

    var _this = this;

    EventStream(cfn, options.name, {pollInterval: 2000})
        .on('error', function (e) {
            if (stackAction === "DELETE" && e.message.indexOf("does not exist") !== -1) {
                console.log("CustomResourcePlugin:  Deletion complete.");
                return cb();
            }
            else {
                return cb(e);
            }
        })
        .on('data', function (e) {
            console.log("CloudFormation: " + e.ResourceStatus[colors[e.ResourceStatus]] + ' ' + e.LogicalResourceId);
            if (e.ResourceStatusReason) {
                console.log('    - ' + e.ResourceStatusReason);
            }
        })
        .on('end', function () {
            console.log("CustomResourcePlugin:  Starting cleanup...");
            //If the stack fails on creation then it should be deleted
            if (stackAction === "CREATE") {
                cfn.describeStacks({"StackName": options.name}, function (err, data) {
                    if (err) {
                        console.log("CustomResourcePlugin:  Error getting stack info for cleanup: " + err.cause.message);
                        cb(err);
                    }
                    else {
                        if (data.Stacks.length === 1) {

                            if (data.Stacks[0].StackStatus === "ROLLBACK_COMPLETE") {
                                _this.deleteStack(cb);
                            }

                        }
                        else {
                            console.log("CustomResourcePlugin:  Stack could not be uniquely identified.  Skipping cleanup...");
                            cb();
                        }
                    }

                });
            }

        });
};


CFNRunner.prototype.createStack = function (cb) {
    console.log("CustomResourcePlugin:  Creating the stack...");
    var _this = this;
    this.cfnConfig.createStack(this.options, function (err) {
        if (err) {
            console.log(err);
            cb(err);
        }
        else {
            _this.monitorStack(_this.options, "CREATE", function (err) {

                //delete any orphan buckets related to this stack, if they're empty
                _this.deleteBuckets(options.name);
                cb(err);

            });
        }
    });
};

CFNRunner.prototype.updateStack = function (cb) {
    console.log("CustomResourcePlugin:  Updating the stack...");
    var _this = this;
    this.cfnConfig.updateStack(this.options, function (err) {
        if (err) {
            console.log(err);
            cb(err);
        }
        else {
            _this.monitorStack(_this.options, "UPDATE", cb);
        }
    });
};

CFNRunner.prototype.deleteStack = function (cb) {
    console.log("CustomResourcePlugin:  Deleting the stack...");
    var _this = this;
    this.cfnConfig.deleteStack(this.options, function (err) {
        if (err) {
            console.log(err);
            cb(err);
        }
        else {
            _this.monitorStack(_this.options, "DELETE", cb);
        }
    });
};

CFNRunner.prototype.deleteBuckets = function (stackName) {
    var S3 = BbPromise.promisifyAll(new AWS.S3(this.awsConfig), {suffix: "Promised"});
    S3.listBucketsPromised()
        .then(function (data) {
            data.Buckets.forEach(function (el) {
                if (el.Name.toLowerCase().indexOf(stackName.toLowerCase()) !== -1) {
                    var params = {
                        Bucket: el.Name
                    };
                    S3.listObjectsPromised(params)
                        .then(function (data) {
                            if (data.Contents.length === 0) {
                                S3.deleteBucketPromised(params)
                                    .then(function () {
                                        console.log("CustomResourcePlugin:  Ophan buckets deleted.");
                                    })
                                    .catch(function (e) {
                                        console.log("CustomResourcePlugin:  Error deleting orphan bucket: " + e.cause.message);

                                    });
                            }
                        });
                }
            });
        })
        .catch(function (e) {
            console.log("CustomResourcePlugin:  Error listing buckets: " + e.cause.message);
        });

};

CFNRunner.prototype.deployStack = function (cb) {

    let _this = this;

    // Helper function to create Stack
    let createStack = function () {
        _this.createStack(function (err) {
            if (err) {
                console.error(err);
                return cb(err);
            }
            else {
                cb();
            }
        });
    };

    // Check to see if Stack Exists
    return _this.CloudFormation.describeStackResourcesPromised({
            StackName: _this.options.name
        })
        .then(function () {
            // Update stack
            _this.updateStack(function (err) {
                if (err) {
                    if (err.message === 'No updates are to be performed.') {
                        console.log('No resource updates are to be performed.');
                    }
                    else {
                        console.error(err);
                        return cb(err);
                    }
                }
                else {
                    cb();
                }
            });
        })
        .catch(function (e) {

            // No updates are to be performed
            if (e.cause.message === 'No updates are to be performed.') {
                console.log('No resource updates are to be performed.');
                cb();
            }
            else {
                // If does not exist, create stack
                if (e.cause.message.indexOf('does not exist') > -1) {
                    return createStack();
                }
                else {
                    console.error(e);
                    return cb(e);
                }
            }
        });
};

