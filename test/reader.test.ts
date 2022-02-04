import {
    ALBLogFields,
    ALBLogRecord,
    CLBLogFields,
    CLBLogRecord,
    NLBLogFields,
    NLBLogRecord,
    parse,
    parseLogFields,
} from '../lib/reader'

describe('Log Parse', () => {

    type Pattern<T extends Record<string, string>, Keys extends string> = {
        name: string
        log: string
        fields: Pick<T, Keys>
    }[]

    const albPatterns: Pattern<ALBLogRecord, 'elb'> = [
        {
            name: 'ALB HTTP log',
            log: 'http 2018-07-02T22:23:00.186641Z app/my-loadbalancer/50dc6c495c0c9188 ' +
                '192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 ' +
                '"GET http://www.example.com:80/ HTTP/1.1" "curl/7.46.0" - - ' +
                'arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 ' +
                '"Root=1-58337262-36d228ad5d99923122bbe354" "-" "-" ' +
                '0 2018-07-02T22:22:48.364000Z "forward" "-" "-" 10.0.0.1:80 200 "-" "-"',
            fields: {
                elb: 'app/my-loadbalancer/50dc6c495c0c9188',
            },
        },
        {
            name: 'ALB HTTPS log',
            log: 'https 2018-07-02T22:23:00.186641Z app/my-loadbalancer/50dc6c495c0c9188 ' +
                '192.168.131.39:2817 10.0.0.1:80 0.086 0.048 0.037 200 200 0 57 ' +
                '"GET https://www.example.com:443/ HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 ' +
                'arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 ' +
                '"Root=1-58337281-1d84f3d73c47ec4e58577259" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" ' +
                '1 2018-07-02T22:22:48.364000Z "authenticate,forward" "-" "-" 10.0.0.1:80 200 "-" "-"',
            fields: {
                elb: 'app/my-loadbalancer/50dc6c495c0c9188',
            },
        },
        {
            name: 'ALB HTTP/2 log',
            log: 'h2 2018-07-02T22:23:00.186641Z app/my-loadbalancer/50dc6c495c0c9188 ' +
                '10.0.1.252:48160 10.0.0.66:9000 0.000 0.002 0.000 200 200 5 257 ' +
                '"GET https://10.0.2.105:773/ HTTP/2.0" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 ' +
                'arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 ' +
                '"Root=1-58337327-72bd00b0343d75b906739c42" "-" "-" ' +
                '1 2018-07-02T22:22:48.364000Z "redirect" "https://example.com:80/" "-" 10.0.0.66:9000 200 "-" "-"',
            fields: {
                elb: 'app/my-loadbalancer/50dc6c495c0c9188',
            },
        },
        {
            name: 'ALB WebSocket log',
            log: 'ws 2018-07-02T22:23:00.186641Z app/my-loadbalancer/50dc6c495c0c9188 ' +
                '10.0.0.140:40914 10.0.1.192:8010 0.001 0.003 0.000 101 101 218 587 ' +
                '"GET http://10.0.0.30:80/ HTTP/1.1" "-" - - ' +
                'arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 ' +
                '"Root=1-58337364-23a8c76965a2ef7629b185e3" "-" "-" ' +
                '1 2018-07-02T22:22:48.364000Z "forward" "-" "-" 10.0.1.192:8010 101 "-" "-"',
            fields: {
                elb: 'app/my-loadbalancer/50dc6c495c0c9188',
            },
        },
        {
            name: 'ALB Secure WebSocket log',
            log: 'wss 2018-07-02T22:23:00.186641Z app/my-loadbalancer/50dc6c495c0c9188 ' +
                '10.0.0.140:44244 10.0.0.171:8010 0.000 0.001 0.000 101 101 218 786 ' +
                '"GET https://10.0.0.30:443/ HTTP/1.1" "-" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 ' +
                'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 ' +
                '"Root=1-58337364-23a8c76965a2ef7629b185e3" "-" "-" ' +
                '1 2018-07-02T22:22:48.364000Z "forward" "-" "-" 10.0.0.171:8010 101 "-" "-"',
            fields: {
                elb: 'app/my-loadbalancer/50dc6c495c0c9188',
            },
        },
        {
            name: 'ALB Lambda success log',
            log: 'http 2018-11-30T22:23:00.186641Z app/my-loadbalancer/50dc6c495c0c9188 ' +
                '192.168.131.39:2817 - 0.000 0.001 0.000 200 200 34 366 ' +
                '"GET http://www.example.com:80/ HTTP/1.1" "curl/7.46.0" - - ' +
                'arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 ' +
                '"Root=1-58337364-23a8c76965a2ef7629b185e3" "-" "-" ' +
                '0 2018-11-30T22:22:48.364000Z "forward" "-" "-" "-" "-" "-" "-"',
            fields: {
                elb: 'app/my-loadbalancer/50dc6c495c0c9188',
            },
        },
        {
            name: 'ALB Lambda fail log',
            log: 'http 2018-11-30T22:23:00.186641Z app/my-loadbalancer/50dc6c495c0c9188 ' +
                '192.168.131.39:2817 - 0.000 0.001 0.000 502 - 34 366 ' +
                '"GET http://www.example.com:80/ HTTP/1.1" "curl/7.46.0" - - ' +
                'arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 ' +
                '"Root=1-58337364-23a8c76965a2ef7629b185e3" "-" "-" ' +
                '0 2018-11-30T22:22:48.364000Z "forward" "-" "LambdaInvalidResponse" "-" "-" "-" "-"',
            fields: {
                elb: 'app/my-loadbalancer/50dc6c495c0c9188',
            },
        },
    ]

    albPatterns.forEach((pat) => {
        test(pat.name, () => {
            const fields = parseLogFields(pat.log)
            expect(fields).toHaveLength(ALBLogFields.length)

            const record = parse(pat.log)
            expect(fields).toEqual(Object.values(record.fields))

            expect(record.fields.elb).toEqual(pat.fields.elb)
        })
    })

    const nlbPatterns: Pattern<NLBLogRecord, 'elb'> = [
        {
            name: 'NLB without ALPN',
            log: 'tls 2.0 2018-12-20T02:59:40 net/my-network-loadbalancer/c6e77e28c25b2234 g3d4b5e8bb8464cd ' +
                '72.21.218.154:51341 172.100.100.185:443 5 2 98 246 - ' +
                'arn:aws:acm:us-east-2:671290407336:certificate/2a108f19-aded-46b0-8493-c63eb1ef4a99 - ' +
                'ECDHE-RSA-AES128-SHA tlsv12 - ' +
                'my-network-loadbalancer-c6e77e28c25b2234.elb.us-east-2.amazonaws.com ' +
                '- - -',
            fields: {
                elb: 'net/my-network-loadbalancer/c6e77e28c25b2234',
            },
        },
        {
            name: 'NLB with ALPN',
            log: 'tls 2.0 2020-04-01T08:51:42 net/my-network-loadbalancer/c6e77e28c25b2234 g3d4b5e8bb8464cd ' +
                '72.21.218.154:51341 172.100.100.185:443 5 2 98 246 - ' +
                'arn:aws:acm:us-east-2:671290407336:certificate/2a108f19-aded-46b0-8493-c63eb1ef4a99 - ' +
                'ECDHE-RSA-AES128-SHA tlsv12 - ' +
                'my-network-loadbalancer-c6e77e28c25b2234.elb.us-east-2.amazonaws.com ' +
                'h2 h2 "h2","http/1.1"',
            fields: {
                elb: 'net/my-network-loadbalancer/c6e77e28c25b2234',
            },
        },
    ]

    nlbPatterns.forEach((pat) => {
        test(pat.name, () => {
            const fields = parseLogFields(pat.log)
            expect(fields).toHaveLength(NLBLogFields.length)

            const record = parse(pat.log)
            expect(fields).toEqual(Object.values(record.fields))

            expect(record.fields.elb).toEqual(pat.fields.elb)
        })
    })

    const clbPatterns: Pattern<CLBLogRecord, 'elb'> = [
        {
            name: 'CLB HTTP log',
            log: '2015-05-13T23:39:43.945958Z my-loadbalancer 192.168.131.39:2817 10.0.0.1:80 0.000073 0.001048 0.000057 200 200 0 29 "GET http://www.example.com:80/ HTTP/1.1" "curl/7.38.0" - -',
            fields: {
                elb: 'my-loadbalancer',
            },
        },
        {
            name: 'CLB HTTPS log',
            log: '2015-05-13T23:39:43.945958Z my-loadbalancer 192.168.131.39:2817 10.0.0.1:80 0.000086 0.001048 0.001337 200 200 0 57 "GET https://www.example.com:443/ HTTP/1.1" "curl/7.38.0" DHE-RSA-AES128-SHA TLSv1.2',
            fields: {
                elb: 'my-loadbalancer',
            },
        },
        {
            name: 'CLB TCP log',
            log: '2015-05-13T23:39:43.945958Z my-loadbalancer 192.168.131.39:2817 10.0.0.1:80 0.001069 0.000028 0.000041 - - 82 305 "- - - " "-" - -',
            fields: {
                elb: 'my-loadbalancer',
            },
        },
        {
            name: 'CLB SSL log',
            log: '2015-05-13T23:39:43.945958Z my-loadbalancer 192.168.131.39:2817 10.0.0.1:80 0.001065 0.000015 0.000023 - - 57 502 "- - - " "-" ECDHE-ECDSA-AES128-GCM-SHA256 TLSv1.2',
            fields: {
                elb: 'my-loadbalancer',
            },
        },
    ]

    clbPatterns.forEach((pat) => {
        test(pat.name, () => {
            const fields = parseLogFields(pat.log)
            expect(fields).toHaveLength(CLBLogFields.length)

            const record = parse(pat.log)
            expect(fields).toEqual(Object.values(record.fields))

            expect(record.fields.elb).toEqual(pat.fields.elb)
        })
    })
})
