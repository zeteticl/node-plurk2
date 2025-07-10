'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.limitTo = exports.PlurkClient = void 0;
const url_1 = require("url");
const querystring_1 = require("querystring");
const events_1 = require("events");
const bluebird_1 = __importDefault(require("bluebird"));
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const oauth_1_0a_1 = __importDefault(require("oauth-1.0a"));
const form_data_1 = __importDefault(require("form-data"));
const limit_to_1 = require("./limit-to");
Object.defineProperty(exports, "limitTo", { enumerable: true, get: function () { return limit_to_1.limitTo; } });
const endPoint = 'https://www.plurk.com/';
const requestTokenUrl = `${endPoint}OAuth/request_token`;
const accessTokenUrl = `${endPoint}OAuth/access_token`;
const pathMatcher = /^\/?(?:APP\/)?(.+)$/;
/**
 * `PlurkClient` is a class that wraps all plurk API call and handles comet channel when enabled.
 * It inherits from Node.js's [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter) class.
 */
class PlurkClient extends events_1.EventEmitter {
    /**
     * Constructor
     * @param consumerKey Consumer token, can be obtain one from Plurk App console.
     * @param consumerSecret Consumer token secret, should be together with consumer token.
     * @param token Oauth access token, optional.
     * You may assign it here or use `getRequestToken()` and then `getAccessToken()`
     * to obtain one from user with oauth authentication flow.
     * @param tokenSecret Oauth access token secret, optional. Also this should be come with access token.
     */
    constructor(consumerKey, consumerSecret, token = '', tokenSecret = '') {
        super();
        /**
         * Flag indicates if the commet channel is started.
         */
        this.cometStarted = false;
        /**
         * Boolean field, set to `true` to automatic stops the
         * comet channel when any error has been thrown,
         * or else it will keep reconnect even have errors.
         */
        this.stopCometOnError = false;
        /**
         * Boolean field, set to `true` to populate the user data
         * to specific fields. For example, response data in comet channel
         * will have a `user` field with user details in it if detail of `user_id`
         * is found in raw channel response.
         */
        this.populateUsers = false;
        this.consumerKey = consumerKey;
        this.consumerSecret = consumerSecret;
        this.token = token;
        this.tokenSecret = tokenSecret;
        this._oauth = new oauth_1_0a_1.default({
            consumer: {
                key: this.consumerKey,
                secret: this.consumerSecret,
            },
            signature_method: 'HMAC-SHA1',
            hash_function: (base, key) => crypto.createHmac('sha1', key).update(base).digest('base64'),
        });
    }
    /**
     * Get oauth request token (temporary) for user to authenticate.
     * It will assigns `token` and `tokenSecret` of current instance for further process.
     * @param callback Redirect URL after authenticate success, can be omitted if this is not a web app.
     * @return {PromiseLike.<this>} Current plurk client instance.
     */
    async getRequestToken(callback = '') {
        const requestData = {
            url: requestTokenUrl,
            method: 'POST',
            data: {
                oauth_callback: callback,
            },
        };
        const { data: body } = await axios_1.default.post(requestData.url, requestData.data, this._getAxiosConfig(requestData));
        return this._setOAuthParams(body);
    }
    /**
     * Get oauth access token (permanent) for requesting other API.
     * It will assigns `token` and `tokenSecret` of current instance.
     * Should be called once users' verifier has been received.
     * @param verifier The oauth verifier received from the user.
     * @return {PromiseLike.<this>} Current plurk client instance.
     */
    async getAccessToken(verifier) {
        const requestData = {
            url: accessTokenUrl,
            method: 'POST',
            data: {
                oauth_verifier: verifier,
            },
        };
        const { data: body } = await axios_1.default.post(requestData.url, requestData.data, this._getAxiosConfig(requestData));
        return this._setOAuthParams(body);
    }
    request(api, parameters) {
        const resolved = pathMatcher.exec(api);
        if (!resolved || resolved.length < 2)
            throw new Error(`Invalid api path '${api}'`);
        const data = {};
        let useFormData = false;
        if (parameters)
            for (let key in parameters) {
                const value = parameters[key];
                switch (typeof value) {
                    case 'undefined':
                    case 'function':
                    case 'symbol': break;
                    case 'object':
                        if (value instanceof Date)
                            data[key] = value.toISOString();
                        else if (value && (value instanceof Buffer || typeof value.pipe === 'function')) {
                            data[key] = value;
                            useFormData = true;
                        }
                        else
                            data[key] = JSON.stringify(value);
                        break;
                    default:
                        data[key] = value;
                        break;
                }
            }
        const requestData = {
            url: `${endPoint}APP/${resolved[1]}`,
            method: 'POST',
            data,
        };
        const config = this._getAxiosConfig(requestData, useFormData);
        if (useFormData) {
            const form = new form_data_1.default();
            for (const key in data)
                if (Object.prototype.hasOwnProperty.call(data, key))
                    form.append(key, data[key]);
            config.data = form;
            config.headers = Object.assign(Object.assign({}, config.headers), form.getHeaders());
        }
        else {
            config.responseType = 'json';
            config.transformResponse = (data) => JSON.parse(data, PlurkClientUtils.parseResponse);
        }
        return new bluebird_1.default((resolve, reject, onCancel) => {
            const source = axios_1.default.CancelToken.source();
            if (onCancel)
                onCancel(() => source.cancel());
            axios_1.default.request(config)
                .then(res => transformWithTiming(res.data, res))
                .then(resolve)
                .catch(reject);
        });
    }
    /**
     * Start long poll from comet channel, it auto handles request for comet server
     * URL and it will auto keep polling until you stops it.
     */
    startComet() {
        if (this.cometStarted)
            return;
        this.cometStarted = true;
        this.request('Realtime/getUserChannel')
            .then((data) => {
            if (!data.comet_server)
                throw new Error('Comet URL not found');
            this._cometUrl = (0, url_1.parse)(data.comet_server, true);
            if (this.cometStarted)
                this.pollComet();
        })
            .catch((err) => {
            this.cometStarted = false;
            this.emit('error', err);
        });
    }
    /**
     * Stops long poll from comet channel.
     */
    stopComet() {
        this.cometStarted = false;
        if (this._pollCometRequest)
            this._pollCometRequest.cancel();
    }
    /**
     * Restart long poll from comet channel.
     * Normally this method is automatically called while polling.
     */
    pollComet() {
        if (this._pollCometRequest)
            this._pollCometRequest.cancel();
        if (!this.cometStarted)
            return;
        if (!this._cometUrl)
            throw new Error('Unknown comet url');
        const source = axios_1.default.CancelToken.source();
        this._pollCometRequest = source;
        (0, axios_1.default)({
            url: this._cometUrl.href,
            timeout: 80000,
            responseType: 'text',
            cancelToken: source.token,
        })
            .then(({ data: response }) => {
            var _a;
            if (!this._cometUrl)
                throw new Error('Unknown comet url');
            const parsedResponse = JSON.parse(response.substring(response.indexOf('{'), response.lastIndexOf('}') + 1), PlurkClientUtils.parseResponse);
            this.emit('comet', parsedResponse, response);
            const { data, user, new_offset } = parsedResponse;
            if (((_a = this._cometUrl) === null || _a === void 0 ? void 0 : _a.query) && typeof this._cometUrl.query !== 'string')
                this._cometUrl.query.offset = new_offset;
            delete this._cometUrl.search;
            if (data && data.length)
                for (const entry of data) {
                    if (this.populateUsers && user)
                        PlurkClientUtils.populateUsers(entry, user);
                    if (entry && entry.type)
                        this.emit(entry.type, entry);
                }
            process.nextTick(PlurkClientUtils.pollComet, this);
        })
            .catch((err) => {
            if (this.stopCometOnError)
                this.cometStarted = false;
            else
                process.nextTick(PlurkClientUtils.pollComet, this);
            this.emit('error', err);
        })
            .finally(() => {
            delete this._pollCometRequest;
        });
    }
    /**
     * User authentication URL. Should be inform user to navigate to this URL
     * once the promise of `getRequestToken(...)` has been resolved.
     */
    get authPage() {
        return `${endPoint}OAuth/authorize?oauth_token=${this.token}`;
    }
    /**
     * Mobile version of user authentication URL.
     * Users may navigate to this URL instead of `authPage` if they are using smartphones.
     */
    get mobileAuthPage() {
        return this.token ? `${endPoint}m/authorize?oauth_token=${this.token}` : '';
    }
    _getAxiosConfig(requestData, useFormData = false) {
        return {
            headers: Object.assign(Object.assign({}, this._oauth.toHeader(this._oauth.authorize(requestData, {
                key: this.token,
                secret: this.tokenSecret,
            }))), { 'Content-Type': useFormData ?
                    'multipart/form-data' :
                    'application/x-www-form-urlencoded' }),
        };
    }
    _setOAuthParams(body) {
        const data = (0, querystring_1.parse)(body);
        if (data.oauth_token)
            this.token = data.oauth_token;
        if (data.oauth_token_secret)
            this.tokenSecret = data.oauth_token_secret;
        return this;
    }
}
exports.PlurkClient = PlurkClient;
function transformWithTiming(body, response) {
    assignIfExists(body, response, 'headers');
    assignIfExists(body, response, 'status');
    assignIfExists(body, response, 'statusText');
    return body;
}
function assignIfExists(target, source, key) {
    if (Object.prototype.hasOwnProperty.call(source, key))
        target[key] = source[key];
}
var PlurkClientUtils;
(function (PlurkClientUtils) {
    const plurkLimitToMatcher = /^(?:\|[0-9]+\|)*$/;
    function pollComet(client) {
        return client.pollComet();
    }
    PlurkClientUtils.pollComet = pollComet;
    function parseResponse(key, value) {
        switch (key) {
            case 'limited_to':
                if (typeof value === 'string' &&
                    plurkLimitToMatcher.test(value))
                    return limit_to_1.limitTo.parse(value);
                break;
            case 'date_of_birth':
            case 'posted':
            case 'now':
            case 'issued':
                if (typeof value === 'string')
                    return new Date(value);
                break;
            case 'timestamp':
                if (typeof value === 'number')
                    return new Date(value * 1000);
                break;
        }
        return value;
    }
    PlurkClientUtils.parseResponse = parseResponse;
    function populateUsers(plurkData, users) {
        plurkData.owner = users[plurkData.owner_id];
        plurkData.user = users[plurkData.user_id];
        plurkData.replurker = users[plurkData.replurker_id];
        if (Array.isArray(plurkData.limit_to))
            plurkData.limit_to_data = plurkData.limit_to.map(populateUsersEntry, users);
        if (Array.isArray(plurkData.favorers))
            plurkData.favorers_data = plurkData.favorers.map(populateUsersEntry, users);
        if (Array.isArray(plurkData.replurkers))
            plurkData.replurkers_data = plurkData.replurkers.map(populateUsersEntry, users);
    }
    PlurkClientUtils.populateUsers = populateUsers;
    function populateUsersEntry(entry) {
        return this[entry];
    }
    PlurkClientUtils.populateUsersEntry = populateUsersEntry;
})(PlurkClientUtils || (PlurkClientUtils = {}));
__exportStar(require("./urlwatch"), exports);
__exportStar(require("./base36"), exports);
//# sourceMappingURL=index.js.map