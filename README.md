# elb-cwlogs-forwarder

Forward the ELB logs output to AWS S3 to CloudWatch Logs.

It supports Application, Network, and Classic Load Balancer logs, and supports output in raw strings or JSON.

```
                              Retrieve log archive
                          ┌──────────────────────────┐
┌─────┐                   ▼                          │          CreateLogStream
│ ALB │ Access Log ┌─────────────┐ S3 Event ┌────────┴────────┐ PutLogEvents    ┌─────────────────┐
│ NLB ├───────────►│  S3 Bucket  ├─────────►│ Lambda Function ├────────────────►│ CloudWatch Logs │
│ CLB │            └──────┬──────┘          └─────────────────┘                 └─────────────────┘
└─────┘                   │                          ▲
                          │                          │
                          │    ┌───────────────┐     │
                          └───►│   SQS Queue   ├─────┘
                               └───────────────┘
                                   S3 Event
```

# Usage

## Lambda handler

If you want to build your own resources other than Lambda, you can use Lambda Handler.

The following environment variables can be set in Lambda Handler

| name                   | required | description                                                                               |
|------------------------|----------|-------------------------------------------------------------------------------------------|
| LOG_GROUP              | yes      | Access log output destination                                                             |
| MESSAGE_FORMAT         | no       | Output format. plain (raw log string) or JSON.                                            |
| LOG_STREAM_NAME_SOURCE | no       | Source of the LogStreamName. elb-name or elb-fullname (like arn).                         |
| LOG_STREAM_NAME        | no       | A Fixed LogStream Name. Cannot be specified at the same time as `LOG_STREAM_NAME_SOURCE`  |

Lambda code:

```typescript
import { lambdaHandler } from 'elb-cwlogs-forwarder'

export {
    lambdaHandler
}
```

## CDK Construct for TypeScript

If you are using AWS CDK with TypeScript, you may be able to use Custom Construct.

Custom Construct creates the following resources:

- Set up notification of ObjectCreated events for S3 Bucket
- SQS to notify Lambda of events, and a DeadLetterQueue
- Lambda Function to forward the logs

```typescript
import { ELBLogs2CloudWatchForwarder } from 'elb-cwlogs-forwarder/cdk'

const app = new cdk.App()
const stack = new cdk.Stack(app, 'TestStack')
const bucket = new s3.Bucket(stack, 'LogBucket')
const logGroup = new logs.LogGroup(stack, 'ELBLog')

new ELBLogs2CloudWatchForwarder(stack, 'LogForwarder', {
    bucket,
    logGroup,
    logFormat: 'json',
    logStreamNameSource: 'elb-name',
})
```