'use strict';

const
    BbPromise = require('bluebird'),
    CFNRunner = require('cfn-runner'),
    chalk = require('chalk');


module.exports = function (S) { // Always pass in the ServerlessPlugin Class


    class SynchronousResource extends S.classes.Plugin {

        constructor() {
            super();
            this.name = 'customResource'; // Define your plugin's name
        }

        registerActions() {

            S.addAction(this._deployResources.bind(this), {
                handler: 'deployResources',
                description: 'A custom action from a custom plugin',
                context: 'synchronousResources',
                contextAction: 'deploy',
                options: [
                    {
                        option: 'stage',
                        shortcut: 's',
                        description: 'stage you want to deploy'
                    },
                    {
                        option: 'region',
                        shortcut: 'r',
                        description: 'region in which you want to deploy'
                    },
                    {
                        option: 'templatePath',
                        shortcut: 't',
                        description: 'CFN stack you want to deploy'
                    }
                ],
                parameters: []
            });

            S.addAction(this._removeResources.bind(this), {
                handler: 'removeResources',
                description: 'A custom action from a custom plugin',
                context: 'synchronousResources',
                contextAction: 'remove',
                options: [
                    {
                        option: 'stage',
                        shortcut: 's',
                        description: 'stage you want to remove'
                    },
                    {
                        option: 'region',
                        shortcut: 'r',
                        description: 'region from which you want to remove'
                    },
                    {
                        option: 'templatePath',
                        shortcut: 't',
                        description: 'CFN stack you want to delete'
                    }
                ],
                parameters: []
            });

            return BbPromise.resolve();
        }


        _deployResources(evt) {

            let _this = this,
            credentials = S.getProvider().getCredentials(evt.options.stage, evt.options.region);

            return new BbPromise(function (resolve, reject) {

                var cfnRunner = new CFNRunner(evt.options.templatePath, credentials);
                var cb = function (err) {
                    if (err) {
                        console.log(err);
                        return reject(evt);
                    }
                };

                cfnRunner.deployStack(cb);

                return resolve(evt);

            });
        }

        _removeResources(evt) {

            let _this = this,
            credentials = S.getProvider().getCredentials(evt.options.stage, evt.options.region);

            return new BbPromise(function (resolve, reject) {
                var cfnRunner = new CFNRunner(evt.options.templatePath, credentials);
                var cb = function (err) {
                    if (err) {
                        console.log(err);
                        return reject(evt);
                    }
                };

                cfnRunner.deleteStack(cb);

                return resolve(evt);

            });
        }


    }

    // Export Plugin Class
    return SynchronousResource;

};
