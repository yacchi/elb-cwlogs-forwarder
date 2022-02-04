import {
    S3Event,
    S3EventRecord,
    S3Handler,
    SQSBatchItemFailure,
    SQSBatchResponse,
    SQSEvent,
    SQSHandler,
    SQSRecord,
} from 'aws-lambda'
import { CloudWatchLogs, S3 } from 'aws-sdk'
import { LogForwarder, LogForwarderProvider } from './forwarder'
import { LogReader } from './reader'

const s3client = new S3()
const logsClient = new CloudWatchLogs()

export type LogFormat = 'plain' | 'json'
export type LogStreamNameSource = 'elb-name' | 'elb-fullname'

export type ELBLogForwarderLambdaEnv = {
    LOG_GROUP: string
    MESSAGE_FORMAT?: LogFormat
} & ({
    LOG_STREAM_NAME_SOURCE?: 'elb-name' | 'elb-fullname'
} | {
    LOG_STREAM_NAME: string
})

const envs = process.env as ELBLogForwarderLambdaEnv

type LambdaHandler = SQSHandler | S3Handler

export const lambdaHandler: LambdaHandler = async (event: SQSEvent | S3Event): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchItemFailure[] = []

    const resolveLogStreamName = (key: string): string => {
        if ('LOG_STREAM_NAME' in envs) {
            return envs.LOG_STREAM_NAME
        } else {
            const source = envs.LOG_STREAM_NAME_SOURCE || 'elb-name'
            switch (source) {
                case 'elb-name':
                case 'elb-fullname':
                    /*
                    ALB: aws-account-id_elasticloadbalancing_region_app.load-balancer-id_end-time_ip-address_random-string.log.gz
                        (https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html#access-log-file-format)
                    NLB: aws-account-id_elasticloadbalancing_region_net.load-balancer-id_end-time_random-string.log.gz
                        (https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-access-logs.html#access-log-file-format)
                    CLB: aws-account-id_elasticloadbalancing_region_load-balancer-name_end-time_ip-address_random-string.log
                        (https://docs.aws.amazon.com/ja_jp/elasticloadbalancing/latest/classic/access-log-collection.html#access-log-file-format)
                    */
                    const items = key.substring(key.lastIndexOf('/') + 1).split('_')
                    const arnSegment = items[3].split('.')
                    if (3 <= arnSegment.length) {
                        // application or network load balancer
                        if (source === 'elb-fullname') {
                            return arnSegment.join('/')
                        } else {
                            return arnSegment[1]
                        }
                    } else {
                        // classic load balancer
                        return arnSegment[0]
                    }
            }
        }
    }

    const provider = new LogForwarderProvider(logsClient, envs.LOG_GROUP, resolveLogStreamName)

    await Promise.all(
        event.Records.map((record: SQSRecord | S3EventRecord) => {
            if ('s3' in record) {
                const forwarder = provider.get(record.s3.object.key)
                return processLogFile(forwarder, record.s3.bucket.name, record.s3.object.key).catch((reason) => {
                    console.log(`process event error. ${reason}`)
                })
            } else if ('receiptHandle' in record) {
                const body: S3Event = JSON.parse(record.body)
                if (body.Records == null) {
                    console.warn(`no s3 event record. ${record.body}`)
                    return
                }
                return Promise.all(body.Records.map((record) => {
                    const forwarder = provider.get(record.s3.object.key)
                    return processLogFile(forwarder, record.s3.bucket.name, record.s3.object.key)
                })).catch((reason) => {
                    console.log(`process event error. ${reason}`)
                    batchItemFailures.push({
                        itemIdentifier: record.messageId,
                    })
                })
            }
            return
        }),
    )

    return {
        batchItemFailures,
    }
}

const processLogFile = async (forwarder: LogForwarder, bucket: string, key: string) => {
    const Bucket = bucket
    const Key = key
    console.log(`Transfer log file of s3://${bucket}/${key}`)

    const logFile = await s3client
        .getObject({
            Bucket,
            Key,
        })
        .createReadStream()

    const reader = new LogReader(logFile, key)

    for await (const record of reader.readLines()) {
        await forwarder.putLogEvent(
            record.timestamp,
            envs.MESSAGE_FORMAT === 'json' ? JSON.stringify(record.fields) : record.raw,
        )
    }

    await forwarder.flush()
}