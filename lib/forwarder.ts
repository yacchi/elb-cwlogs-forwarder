import { InputLogEvents } from 'aws-sdk/clients/cloudwatchlogs'
import { CloudWatchLogs } from 'aws-sdk'

// https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html
// https://github.com/aws/aws-sdk-js/blob/2e253da090249ce9ad46c44827cb1d2418035298/clients/cloudwatchlogs.d.ts#L263
const MAX_BATCH_SIZE = 1048576
const MAX_BATCH_COUNT = 10000
const LOG_EVENT_OVERHEAD = 26

export class LogForwarder {
    logEvents: InputLogEvents = []
    nextSequenceToken: string | undefined

    constructor(
        private readonly client: CloudWatchLogs,
        private readonly logGroup: string,
        private readonly logStream: string,
    ) {
    }

    async putLogEvent(timestamp: Date, message: string) {
        const size =
            this.logEvents.reduce((sum, item) => {
                return sum + item.message.length
            }, LOG_EVENT_OVERHEAD) + message.length

        if (MAX_BATCH_SIZE < size || MAX_BATCH_COUNT <= this.logEvents.length) {
            await this.flush()
        }

        this.logEvents.push({
            timestamp: timestamp.getTime(),
            message,
        })
    }

    private async ensureLogStream() {
        let found = false
        try {
            const logStreams = await this.client
                .describeLogStreams({
                    logGroupName: this.logGroup,
                    logStreamNamePrefix: this.logStream,
                })
                .promise()
            const stream = logStreams.logStreams?.find((item) => item.logStreamName === this.logStream)
            if (stream) {
                found = true
                if (stream.uploadSequenceToken) {
                    this.nextSequenceToken = stream.uploadSequenceToken
                }
            }
        } finally {
            if (!found) {
                await this.client
                    .createLogStream({
                        logGroupName: this.logGroup,
                        logStreamName: this.logStream,
                    })
                    .promise()
            }
        }
    }

    async flush() {
        if (!this.nextSequenceToken) {
            await this.ensureLogStream()
        }

        const res = await this.client
            .putLogEvents({
                logGroupName: this.logGroup,
                logStreamName: this.logStream,
                logEvents: this.logEvents,
                sequenceToken: this.nextSequenceToken,
            })
            .promise()
        if (res) {
            this.nextSequenceToken = res.nextSequenceToken
            this.logEvents = []
        }
    }
}

export class LogForwarderProvider {
    private readonly forwarders: Map<string, LogForwarder>

    constructor(
        private readonly client: CloudWatchLogs,
        private readonly logGroup: string,
        private readonly logStreamNameResolver: (logObjectKey: string) => string,
    ) {
        this.forwarders = new Map()
    }

    get(logObjectKey: string): LogForwarder {
        const logStreamName = this.logStreamNameResolver(logObjectKey)
        if (this.forwarders.has(logStreamName)) {
            return this.forwarders.get(logStreamName)!
        }

        const forwarder = new LogForwarder(this.client, this.logGroup, logStreamName)
        this.forwarders.set(logStreamName, forwarder)
        return forwarder
    }
}