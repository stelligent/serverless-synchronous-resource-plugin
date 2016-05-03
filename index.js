'use strict';

const
    fs = require('fs'),
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
                    },
                    {
                        option: 'configPath',
                        shortcut: 'c',
                        description: 'Configs for the stack execution'
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
                    },
                    {
                        option: 'configPath',
                        shortcut: 'c',
                        description: 'Configs for the stack execution'
                    }
                ],
                parameters: []
            });

            return BbPromise.resolve();
        }


        _deployResources(evt) {

            let _this = this;

            return new BbPromise(function (resolve, reject) {

              _this._getOptions(evt)
                .then(function(options){
                  var cfnRunner = new CFNRunner(options);
                  var cb = function (err) {
                      if (err) {
                          console.log(err);
                          return reject(evt);
                      }
                  };
                  cfnRunner.deployStack(cb);

                  return resolve(evt);
                });

            });
        }

        _removeResources(evt) {

            let _this = this

            return new BbPromise(function (resolve, reject) {

              _this._getOptions(evt)
                .then(function(options){
                  var cfnRunner = new CFNRunner(options);
                  var cb = function (err) {
                      if (err) {
                          console.log(err);
                          return reject(evt);
                      }
                  };
                  cfnRunner.deleteStack(cb);

                  return resolve(evt);
                });

            });
        }

        _getOptions(evt){
          let config, options;
          return new BbPromise(function(res, rej){
            S.getProvider().getCredentials(evt.options.stage, evt.options.region)
            .then(function(credentials){
              let config = JSON.parse(fs.readFileSync(evt.options.configPath));
              let options = {
                      "region": evt.options.region,
                      "template": evt.options.templatePath,
                      "name": evt.options.templatePath.slice(
                        evt.options.templatePath.lastIndexOf("/")+1,
                        evt.options.templatePath.lastIndexOf(".")),
                      "force": config.force,
                      "update": false,
                      "config": evt.options.configPath,
                      "defaults": config.defaults || {},
                      "creds": credentials
                  };
                  options.defaults.LambdaStage = evt.options.stage;
                  res(options);
            });

          });

        }


    }

    // Export Plugin Class
    return SynchronousResource;

};
