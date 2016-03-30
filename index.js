'use strict';

const
  BbPromise = require('bluebird'), // Serverless uses Bluebird Promises and we recommend you do to because they provide more than your average Promise :)
  CFNRunner = require('./lib/cfnRunner');

module.exports = function(S) { // Always pass in the ServerlessPlugin Class

  class CustomResource extends S.classes.Plugin {

    /**
     * Constructor
     * - Keep this and don't touch it unless you know what you're doing.
     */

    constructor() {
      super();
      this.name = 'customResource'; // Define your plugin's name
    }

    /**
     * Register Actions
     * - If you would like to register a Custom Action or overwrite a Core Serverless Action, add this function.
     * - If you would like your Action to be used programatically, include a "handler" which can be called in code.
     * - If you would like your Action to be used via the CLI, include a "description", "context", "action" and any options you would like to offer.
     * - Your custom Action can be called programatically and via CLI, as in the example provided below
     */

    registerActions() {

      S.addAction(this._deployCustomResources.bind(this), {
        handler:       'deployCustomResources',
        description:   'A custom action from a custom plugin',
        context:       'customResources',
        contextAction: 'deploy',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to deploy'
          },
          {
            option:      'region',
            shortcut:    'r',
            description: 'region in which you want to deploy'
          },
          {
            option:      'templatePath',
            shortcut:    't',
            description: 'CFN stack you want to deploy'
          }
        ],
        parameters: []
      });

      S.addAction(this._removeCustomResources.bind(this), {
        handler:       'removeCustomResources',
        description:   'A custom action from a custom plugin',
        context:       'customResources',
        contextAction: 'remove',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to remove'
          },
          {
            option:      'region',
            shortcut:    'r',
            description: 'region from which you want to remove'
          },
          {
            option:      'templatePath',
            shortcut:    't',
            description: 'CFN stack you want to delete'
          }
        ],
        parameters: []
      });

      return BbPromise.resolve();
    }


    _deployCustomResources(evt) {

      return new BbPromise(function (resolve, reject) {

        var cfnRunner = new CFNRunner(evt.options.region, evt.options.templatePath);
        var cb = function(err){
          if (err) {
            console.log(err);
            return reject(evt);
          }
        };
        cfnRunner.deployStack(cb);

        return resolve(evt);

      });
    }

    _removeCustomResources(evt) {

      return new BbPromise(function (resolve, reject) {

        var cfnRunner = new CFNRunner(evt.options.region, evt.options.templatePath);
        var cb = function(err){
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
  return CustomResource;

};