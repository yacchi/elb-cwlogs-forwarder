import { Readable } from 'stream'
import * as readline from 'readline'
import * as zlib from 'zlib'

// https://docs.aws.amazon.com/ja_jp/elasticloadbalancing/latest/application/load-balancer-access-logs.html#access-log-entry-format
export const ALBLogFields = [
    'type',
    'time',
    'elb',
    'client:port',
    'target:port',
    'request_processing_time',
    'target_processing_time',
    'response_processing_time',
    'elb_status_code',
    'target_status_code',
    'received_bytes',
    'sent_bytes',
    'request',
    'user_agent',
    'ssl_cipher',
    'ssl_protocol',
    'target_group_arn',
    'trace_id',
    'domain_name',
    'chosen_cert_arn',
    'matched_rule_priority',
    'request_creation_time',
    'actions_executed',
    'redirect_url',
    'error_reason',
    'target:port_list',
    'target_status_code_list',
    'classification',
    'classification_reason',
] as const

export const NLBLogFields = [
    'type',
    'version',
    'time',
    'elb',
    'listener',
    'client:port',
    'destination:port',
    'connection_time',
    'tls_handshake_time',
    'received_bytes',
    'sent_bytes',
    'incoming_tls_alert',
    'chosen_cert_arn',
    'chosen_cert_serial',
    'tls_cipher',
    'tls_protocol_version',
    'tls_named_group',
    'domain_name',
    'alpn_fe_protocol',
    'alpn_be_protocol',
    'alpn_client_preference_list',
] as const

export const CLBLogFields = [
    'time',
    'elb',
    'client:port',
    'backend:port',
    'request_processing_time',
    'backend_processing_time',
    'response_processing_time',
    'elb_status_code',
    'backend_status_code',
    'received_bytes',
    'sent_bytes',
    'request',
    'user_agent',
    'ssl_cipher',
    'ssl_protocol',
] as const

type LogFields = readonly string[]

export type ALBLogFields = typeof ALBLogFields[number]
export type NLBLogFields = typeof NLBLogFields[number]
export type CLBLogFields = typeof CLBLogFields[number]

export type ALBLogRecord = Record<ALBLogFields, string>
export type NLBLogRecord = Record<NLBLogFields, string>
export type CLBLogRecord = Record<CLBLogFields, string>

export type LogRecord = {
    timestamp: Date
    raw: string
} & ({
    type: 'alb'
    fields: ALBLogRecord
} | {
    type: 'nlb'
    fields: NLBLogRecord
} | {
    type: 'clb'
    fields: CLBLogRecord
})

const FIELD_SEPARATOR = ' '
const QUOTE_CHAR = '"'
const ESCAPE_CHAR = '\\'

export const parseLogFields = (line: string): string[] => {
    const fields = []
    let field = ''
    let quote = false
    let escape = false

    for (const c of [...line]) {
        switch (c) {
            case ESCAPE_CHAR:
                if (!escape) {
                    escape = true
                    continue
                }
                break
            case QUOTE_CHAR:
                if (!escape) {
                    quote = !quote
                    continue
                }
                break
            case FIELD_SEPARATOR:
                if (!escape && !quote) {
                    fields.push(field)
                    field = ''
                    continue
                }
        }
        field += c
        escape = false
    }
    if (0 < field.length) {
        fields.push(field)
    }

    return fields
}

export const parse = <T extends LogFields>(line: string): LogRecord => {
    const fields = parseLogFields(line)

    if (fields[2].startsWith('app/')) {
        const record = ALBLogFields.reduce((record, header, idx) => {
            record[header] = fields[idx]
            return record
        }, {} as ALBLogRecord)
        return {
            type: 'alb',
            timestamp: new Date(fields[1]),
            fields: record,
            raw: line,
        }
    } else if (fields[3].startsWith('net/')) {
        const record = NLBLogFields.reduce((record, header, idx) => {
            record[header] = fields[idx]
            return record
        }, {} as NLBLogRecord)
        return {
            type: 'nlb',
            timestamp: new Date(fields[2]),
            fields: record,
            raw: line,
        }
    } else {
        const record = CLBLogFields.reduce((record, header, idx) => {
            record[header] = fields[idx]
            return record
        }, {} as CLBLogRecord)
        return {
            type: 'clb',
            timestamp: new Date(fields[0]),
            fields: record,
            raw: line,
        }
    }
}

export class LogReader {
    constructor(private readonly stream: Readable, readonly key: string) {
    }

    async* readLines(): AsyncGenerator<LogRecord> {
        let stream = this.stream
        if (this.key.endsWith(".gz")) {
            stream = stream.pipe(zlib.createGunzip())
        }
        const rl = readline.createInterface(stream)
        // NodeJS v12 and later can use readline.Interface as an AsyncIterator, but typescript errors.
        // @ts-ignore
        for await (const line of rl) {
            yield parse(line)
        }
    }
}