'use strict';

let BbPromise = require('bluebird'),
    AWS = require('aws-sdk'),
    chalk     = require('chalk'),
    readline = require('readline');

module.exports = CFNRunner;

function CFNRunner(region, templatePath) {

    this.cfnConfig = require('cfn-config');

    this.msgPrefix = function(){
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        return '  | ';
    };

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
    require('chalk');
    var colors = {
        "CREATE_IN_PROGRESS": chalk.yellow,
        "CREATE_FAILED": chalk.red,
        "CREATE_COMPLETE": chalk.green,
        "DELETE_IN_PROGRESS": chalk.yellow,
        "DELETE_FAILED": chalk.red,
        "DELETE_COMPLETE": chalk.gray,
        "DELETE_SKIPPED": chalk.gray,
        "UPDATE_IN_PROGRESS": chalk.yellow,
        "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS": chalk.yellow,
        "UPDATE_FAILED": chalk.red,
        "UPDATE_COMPLETE": chalk.green,
        "ROLLBACK_IN_PROGRESS": chalk.red,
        "ROLLBACK_COMPLETE": chalk.red
    };

    var cfn = new AWS.CloudFormation(this.awsConfig);

    var EventStream = require('cfn-stack-event-stream');

    var _this = this;

    EventStream(cfn, options.name, {pollInterval: 4000})
        .on('error', function (e) {
            if (stackAction === "DELETE" && e.message.indexOf("does not exist") !== -1) {
                console.log(_this.msgPrefix() + "Deletion complete.");
                return cb();
            }
            else {
                return cb(e);
            }
        })
        .on('data', function (e) {
            console.log(
                _this.msgPrefix() +
                colors[e.ResourceStatus](e.ResourceStatus) + ' ' +
                e.LogicalResourceId +
                (e.ResourceStatusReason ? '  - ' + e.ResourceStatusReason : '')
            );
        })
        .on('end', function () {
            console.log(_this.msgPrefix() + "Starting cleanup...");
            //If the stack fails on creation then it should be deleted
            if (stackAction === "CREATE") {
                cfn.describeStacks({"StackName": options.name}, function (err, data) {
                    if (err) {
                        console.log(_this.msgPrefix + "Error getting stack info for cleanup: " + err.cause.message);
                        cb(err);
                    }
                    else {
                        if (data.Stacks.length === 1) {

                            if (data.Stacks[0].StackStatus === "ROLLBACK_COMPLETE") {
                                _this.deleteStack(cb);
                            }
                            else{
                                cb();
                            }

                        }
                        else {
                            console.log(_this.msgPrefix + "Stack could not be uniquely identified.  Skipping cleanup...");
                            cb();
                        }
                    }

                });
            }
            else {
                cb();
            }

        });
};


CFNRunner.prototype.createStack = function (cb) {
    console.log(this.msgPrefix() + "Creating the stack...");
    var _this = this;
    this.cfnConfig.createStack(this.options, function (err) {
        if (err) {
            console.log(err);
            cb(err);
        }
        else {
            _this.monitorStack(_this.options, "CREATE", function (err) {

                //delete any orphan buckets related to this stack, if they're empty
                _this.deleteBuckets(_this.options.name);
                cb(err);

            });
        }
    });
};

CFNRunner.prototype.updateStack = function (cb) {
    console.log(this.msgPrefix() + "Updating the stack...");
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
    console.log(this.msgPrefix() + "Deleting the stack...");
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
    var _this = this;
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
                                        console.log(_this.msgPrefix() + "Ophan buckets deleted.");
                                    })
                                    .catch(function (e) {
                                        console.log(_this.msgPrefix() + "Error deleting orphan bucket: " + e.cause.message);

                                    });
                            }
                        });
                }
            });
        })
        .catch(function (e) {
            console.log(this.msgPrefix() + "Error listing buckets: " + e.cause.message);
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
                        console.log(_this.msgPrefix() + 'No resource updates are to be performed.');
                        cb();
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
            // If does not exist, create stack
            if (e.cause.message.indexOf('does not exist') > -1) {
                return createStack();
            }
            else {
                console.error(e);
                return cb(e);
            }
        });
};

