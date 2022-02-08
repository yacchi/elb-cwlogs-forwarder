import * as path from 'path'
import * as fs from 'fs'
import { Duration } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { EventType, IBucket } from 'aws-cdk-lib/aws-s3'
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications'
import { ILogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { Queue, QueueProps } from 'aws-cdk-lib/aws-sqs'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Architecture, Function, Runtime } from 'aws-cdk-lib/aws-lambda'
import { ELBLogForwarderLambdaEnv, LogFormat, LogStreamNameSource } from '../../lib/lambda'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import { NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs/lib/function'
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam'

export type ELBLogs2CloudWatchForwarderProps = {
    // Define construct properties here
    bucket: IBucket
    prefix?: string
    logGroup: ILogGroup
    logFormat: LogFormat
    logEventQueueProps?: QueueProps,
    forwarderProps?: Exclude<NodejsFunctionProps, 'functionName' | 'entry' | 'handler' | 'environment'>
} & (
    {
        logStreamNameSource: LogStreamNameSource,
    } |
    {
        logStreamName: string
    }
    )

export const LogForwarderLambdaEnv = (envs: ELBLogForwarderLambdaEnv): { [_: string]: string } => envs as { [_: string]: string }

export class ELBLogs2CloudWatchForwarder extends Construct {
    readonly logEventQueue: Queue
    readonly forwarderFunction: Function

    constructor(scope: Construct, id: string, props: ELBLogs2CloudWatchForwarderProps) {
        super(scope, id)

        const { bucket, prefix, logGroup } = props

        let timeout = props.logEventQueueProps?.visibilityTimeout ?? props.forwarderProps?.timeout ?? Duration.minutes(1)

        const queue = new Queue(this, `${id}-log-event`, {
            visibilityTimeout: timeout,
            ...props.logEventQueueProps,
        })
        this.logEventQueue = queue

        bucket.addEventNotification(EventType.OBJECT_CREATED, new SqsDestination(queue), {
            prefix,
            suffix: '.gz',
        })

        let environment: { [_: string]: string }

        if ('logStreamName' in props) {
            environment = LogForwarderLambdaEnv({
                LOG_GROUP: logGroup.logGroupName,
                MESSAGE_FORMAT: props.logFormat,
                LOG_STREAM_NAME: props.logStreamName,
            })
        } else {
            environment = LogForwarderLambdaEnv({
                LOG_GROUP: logGroup.logGroupName,
                MESSAGE_FORMAT: props.logFormat,
                LOG_STREAM_NAME_SOURCE: props.logStreamNameSource,
            })
        }

        const projectRoot = path.join(__dirname, '..', '..')
        let entry = path.join(projectRoot, 'lib', 'lambda.ts')
        if (!fs.existsSync(entry)) {
            entry = path.join(projectRoot, 'lib', 'lambda.js')
        }

        const forwarder = new NodejsFunction(this, `${id}-log-forwarder`, {
            entry,
            handler: 'lambdaHandler',
            depsLockFilePath: path.join(projectRoot, 'yarn.lock'),
            runtime: Runtime.NODEJS_14_X,
            timeout,
            logRetention: RetentionDays.ONE_MONTH,
            architecture: Architecture.ARM_64,
            environment,
            ...props.forwarderProps,
        })
        
        this.forwarderFunction = forwarder

        forwarder.addToRolePolicy(new PolicyStatement({
                sid: 'RetrieveLogFile',
                effect: Effect.ALLOW,
                actions: [
                    's3:GetObject',
                ],
                resources: [
                    `${bucket.bucketArn}/${prefix || ''}*`,
                ],
            },
        ))

        forwarder.addToRolePolicy(new PolicyStatement({
            sid: 'ForwardingLog',
            effect: Effect.ALLOW,
            actions: [
                'logs:DescribeLogStreams',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
            ],
            resources: [
                `${logGroup.logGroupArn}/*`,
            ],
        }))

        forwarder.addEventSource(new SqsEventSource(queue))
    }
}
