## serverless-synchronous-resource-plugin

Serverless plugin for synchronously deploying CFN stacks with monitoring of stack events.

**Usage**

This plugin provides a new Serverless Actions which can be invoked via the Serverless CLI from a project root directory.

```
# Create or upate a CFN stack
==> synchronousResources deploy -t relative/path/to/a/cfn/template.json -s prod -r us-east-1
```

```
# Delete a CFN stack
==> synchronousResources remove -t relative/path/to/a/cfn/template.json -s prod -r us-east-1
```


