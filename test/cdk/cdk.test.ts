import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Match, Template } from 'aws-cdk-lib/assertions'
import * as forwarderStack from '../../cdk'

test('Forwarder Created', () => {
    const app = new cdk.App()
    const stack = new cdk.Stack(app, 'TestStack')

    const bucket = new s3.Bucket(stack, 'LogBucket')
    const logGroup = new logs.LogGroup(stack, 'ELBLog')

    // WHEN
    new forwarderStack.ELBLogs2CloudWatchForwarder(stack, 'MyTestConstruct', {
        bucket,
        logGroup,
        logFormat: 'json',
        logStreamNameSource: 'elb-name',
    })

    // THEN
    const template = Template.fromStack(stack)

    template.resourceCountIs('AWS::SQS::Queue', 1)

    const s3eventRule = {
        NotificationConfiguration: {
            QueueConfigurations: Match.arrayWith([
                {
                    Events: [
                        's3:ObjectCreated:*',
                    ],
                    Filter: {
                        Key: {
                            FilterRules: [
                                {
                                    Name: 'suffix',
                                    Value: '.gz',
                                },
                            ],
                        },
                    },
                    QueueArn: Match.anyValue(),
                },
            ]),
        },
    }

    template.hasResourceProperties('Custom::S3BucketNotifications', s3eventRule)

    const lambdaHandlerProps = {
        Handler: 'index.lambdaHandler',
        Environment: {
            Variables: {
                LOG_GROUP: {
                    Ref: Match.anyValue(),
                },
                MESSAGE_FORMAT: 'json',
                LOG_STREAM_NAME_SOURCE: 'elb-name',
            },
        },
    }

    template.hasResourceProperties('AWS::Lambda::Function', lambdaHandlerProps)

    const bucketResourceID = Object.keys(template.findResources('AWS::S3::Bucket'))[0]
    const logGroupResourceID = Object.keys(template.findResources('AWS::Logs::LogGroup'))[0]

    template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
            Statement: Match.arrayWith([
                {
                    Action: 's3:GetObject',
                    Effect: 'Allow',
                    Resource: {
                        'Fn::Join': [
                            '',
                            [{ 'Fn::GetAtt': [bucketResourceID, 'Arn'] }, '/*'],
                        ],
                    },
                    Sid: 'RetrieveLogFile',
                },
                {
                    Action: [
                        'logs:DescribeLogStreams',
                        'logs:CreateLogStream',
                        'logs:PutLogEvents',
                    ],
                    Effect: 'Allow',
                    Resource: {
                        'Fn::Join': [
                            '',
                            [{ 'Fn::GetAtt': [logGroupResourceID, 'Arn'] }, '/*'],
                        ],
                    },
                    Sid: 'ForwardingLog',
                },
            ]),
        },
    })
})
