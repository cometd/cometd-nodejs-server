/*
 * Copyright (c) 2020 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export interface Callback<R> {
    (error?: Error, result?: R): void;
}

export interface VarArgFunction {
    (...args: any[]): void
}

export interface ServerMessage {
    advice?: any;
    channel: string;
    clientId?: string;
    connectionType?: string;
    data?: any;
    error?: string;
    ext?: any;
    id?: string;
    minimumVersion?: string;
    reply?: ServerMessage;
    subscription?: string[];
    successful?: boolean;
    supportedConnectionTypes?: string[];
    version?: string;
}

export interface ServerSessionExtension {
    incoming?(session: ServerSession, message: ServerMessage, callback: Callback<boolean>): void;

    outgoing?(sender: ServerSession, session: ServerSession, message: ServerMessage, callback: Callback<ServerMessage>): void;
}

export interface ServerChannel {
    readonly name: string;
    readonly meta: boolean;
    readonly service: boolean;
    readonly broadcast: boolean;
    readonly wildNames: string[];

    publish(sender: ServerSession | null, data: any, callback?: Callback<boolean>): void;

    addListener(event: string, fn: VarArgFunction): void;

    removeListener(event: string, fn: VarArgFunction): boolean;

    listeners(event: string): VarArgFunction[];

    readonly subscribers: ServerSession[];
}

export interface ServerSession {
    readonly id: string

    addExtension(extension: ServerSessionExtension): void;

    removeExtension(extension: ServerSessionExtension): boolean;

    readonly extensions: ServerSessionExtension[];

    addListener(event: string, fn: VarArgFunction): void;

    removeListener(event: string, fn: VarArgFunction): boolean;

    listeners(event: string): VarArgFunction[];

    deliver(sender: ServerSession | null, channelName: string, data: any, callback?: Callback<boolean>): void;

    readonly subscriptions: ServerChannel[];

    batch(fn: () => void): void;

    disconnect(callback?: Callback<boolean>): void;
}

export interface ServerExtension {
    incoming?(server: CometDServer, session: ServerSession, message: ServerMessage, callback: Callback<boolean>): void;

    outgoing?(server: CometDServer, sender: ServerSession, session: ServerSession, message: ServerMessage, callback: Callback<boolean>): void;
}

export interface SecurityPolicy {
    canHandshake?(session: ServerSession, message: ServerMessage, callback: Callback<boolean>): void;

    canCreate?(session: ServerSession, message: ServerMessage, channelName: string, callback: Callback<boolean>): void;

    canSubscribe?(session: ServerSession, message: ServerMessage, channel: ServerChannel, callback: Callback<boolean>): void;

    canPublish?(session: ServerSession, message: ServerMessage, channel: ServerChannel, callback: Callback<boolean>): void;
}

export interface CometDServer {
    readonly options: Options;
    policy: SecurityPolicy;

    addListener(event: string, fn: VarArgFunction): void;

    removeListener(event: string, fn: VarArgFunction): boolean;

    listeners(event: string): VarArgFunction[];

    addExtension(extension: ServerExtension): void;

    removeExtension(extension: ServerExtension): boolean;

    readonly extensions: ServerExtension[];

    handle(request: any, response: any): void;

    getServerChannel(name: string): ServerChannel;

    createServerChannel(name: string): ServerChannel;

    getServerSession(id: string): ServerSession;

    readonly context: any;

    close(): void;
}

export interface Options {
    // Common options.
    interval?: number;
    logLevel?: 'debug' | 'info';
    maxInterval?: number;
    sweepPeriod?: number;
    timeout?: number;
    // HTTP options.
    browserCookieDomain?: string;
    browserCookieHttpOnly?: boolean;
    browserCookieMaxAge?: number;
    browserCookieName?: string;
    browserCookiePartitioned?: boolean;
    browserCookiePath?: string;
    browserCookieSameSite?: 'Strict' | 'Lax' | 'None';
    browserCookieSecure?: boolean;
    duplicateMetaConnectHttpResponseCode?: number;
    maxSessionsPerBrowser?: number;
    multiSessionInterval?: number;
}

export function createCometDServer(options?: Options): CometDServer;
