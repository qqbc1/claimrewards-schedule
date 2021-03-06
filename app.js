'use strict';

const cron   = require('node-cron');
const config = require('./config');
const logger = require('./logger');

// eosjs require
const { Api, JsonRpc, RpcError } = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');      // development only
const fetch = require('node-fetch');                                    // node only; not needed in browsers
const { TextEncoder, TextDecoder } = require('util');                   // node only; native TextEncoder/Decoder

// eosjs set
const rpc = new JsonRpc(config.rpc_addr, { fetch });
const signatureProvider = new JsSignatureProvider([config.producer_prikey]);
const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

// globa task
var task;

/**
 * 超级节点领取奖励
 */
const claimrewards = async (trytimes = 1) => {
    // logger.info('try claimrewards: ', trytimes);
    if (!trytimes || trytimes < 0) {
        logger.info('cancel claimrewards cause trytimes:', trytimes);
        return;
    }

    try {
        let result = await api.transact({
            actions: [{
                account: 'eosio',
                name: 'claimrewards',
                authorization: [{
                    actor: config.producer_name,
                    permission: 'active',
                }],
                data: {
                    owner: config.producer_name,
                },
            }]
        }, {
            blocksBehind: 3,    // 滞后块数，整数
            expireSeconds: 30,  // 超时秒数，整数
        });
        if (typeof result === 'object') {
            logger.info('claimrewards result:\n', JSON.stringify(result));
        } else {
            logger.info('claimrewards result:\n', result);
        }

        // next
        let later  = 86400 + 1;  // 1天后的下1秒
        let next   = new Date((Math.ceil(Date.now() / 1000) + later) * 1000);
        let expression = `${next.getSeconds()} ${next.getMinutes()} ${next.getHours()} ${next.getDate()} * *`;
        start(expression);
    } catch (err) {
        logger.error('claimrewards caught exeption:\n', err);
        // if (err instanceof RpcError) {
        //     logger.error('rpc error:\n', JSON.stringify(err.json, null, 2));
        // }
        setTimeout(() => {
            claimrewards(--trytimes);
        }, 1000 * 30);  // try again 30s later
    }
};

/**
 * start
 */
const start = (expression) => {
    if (task) {
        task.destroy();
    }

    if (cron.validate(expression)) {
        logger.info('start a schedule...');
        task = cron.schedule(expression, () => {
            claimrewards(5);
        });
        logger.info('started a schedule successfully(second minute hour day_of_month month day_of_week): ', expression, '\n');
    } else {
        logger.error('invalid expression: ', expression);
        process.exit(1);
    }
};

start(config.schedule_time);
