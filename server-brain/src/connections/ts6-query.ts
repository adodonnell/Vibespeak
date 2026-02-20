import net from 'net';
import { logger } from '../utils/logger.js';

export interface TS6Config {
  host: string;
  port: number;
  username: string;
  password: string;
  serverId?: number;
}

export interface ServerInfo {
  virtualserver_name: string;
  virtualserver_version: string;
  virtualserver_clientsonline: number;
  virtualserver_channelsonline: number;
  [key: string]: string | number;
}

export interface TSClient {
  clid: number;
  client_nickname: string;
  client_type: number;
  [key: string]: string | number;
}

export interface TSChannel {
  cid: number;
  channel_name: string;
  channel_order: number;
  [key: string]: string | number;
}

interface PendingCommand {
  resolve: (value: string) => void;
  reject: (reason?: any) => void;
  command: string;
  startTime: number;
  responseLines: string[];
  isMultiLine: boolean;
}

export class TS6Query {
  private client: net.Socket | null = null;
  private config: TS6Config;
  private connected: boolean = false;
  private commandQueue: PendingCommand[] = [];
  private responseBuffer: string = '';
  private ready: boolean = false;

  constructor(config: TS6Config) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`Connecting to TS6 ServerQuery at ${this.config.host}:${this.config.port}`);

      this.client = net.createConnection({
        host: this.config.host,
        port: this.config.port,
        keepAlive: true,
        keepAliveInitialDelay: 0,
      }, () => {
        logger.info('TCP connection established, waiting for ServerQuery ready...');
      });

      // Set timeout for the connection
      this.client.setTimeout(5000);
      
      this.client.on('timeout', () => {
        logger.warn('Socket timeout');
        this.client?.destroy();
      });

      this.client.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      this.client.on('close', () => {
        logger.info('Connection closed');
        this.connected = false;
        this.rejectAllPending('Connection closed');
      });

      this.client.on('error', (err) => {
        logger.error('Connection error:', err);
        this.rejectAllPending(err);
        reject(err);
      });

      // Wait for ready signal first
      const checkConnection = () => {
        if (this.ready) {
          this.doLogin().then(() => {
            resolve();
          }).catch(reject);
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.ready) {
          reject(new Error('Connection timeout - server not responding'));
        }
      }, 10000);
      
      checkConnection();
    });
  }

  private async doLogin(): Promise<void> {
    try {
      // Login with username/password
      await this.sendCommand(`login ${this.config.username} ${this.config.password}`);
      logger.info('Login successful');

      // Select virtual server if specified
      if (this.config.serverId) {
        await this.sendCommand(`use ${this.config.serverId}`);
        logger.info(`Selected virtual server ID: ${this.config.serverId}`);
      }

      this.connected = true;
      logger.info('Successfully connected and logged in to TeamSpeak 6 ServerQuery');
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }

  private rejectAllPending(error: Error | string): void {
    const err = typeof error === 'string' ? new Error(error) : error;
    for (const pending of this.commandQueue) {
      pending.reject(err);
    }
    this.commandQueue = [];
  }

  private handleData(data: string): void {
    this.responseBuffer += data;
    
    logger.info(`Raw data received: ${JSON.stringify(data)}`);
    
    // Process complete lines
    while (this.responseBuffer.includes('\n')) {
      const lineEnd = this.responseBuffer.indexOf('\n');
      const line = this.responseBuffer.substring(0, lineEnd).trim();
      this.responseBuffer = this.responseBuffer.substring(lineEnd + 1);
      
      if (line) {
        logger.info(`Received line: ${line}`);
        
        // Check for ready notification - TeamSpeak 6 may send it differently
        if (line.includes('msg=ready') || line.includes('ready') || line === 'TS3') {
          logger.info('ServerQuery ready signal received');
          this.ready = true;
        }
        
        // Check for error responses
        if (line.includes('error id=')) {
          this.processResponse(line);
        }
        
        // Handle multi-line responses - look for data markers
        if (line.includes('=') && !line.startsWith('error') && !line.startsWith('msg=')) {
          this.processResponse(line);
        }
      }
    }
  }

  private processResponse(line: string): void {
    // Find pending command
    if (this.commandQueue.length > 0) {
      const pending = this.commandQueue[0]; // Peek at first pending command
      
      if (pending.isMultiLine) {
        // Check for end of response (error line or empty line after data)
        if (line.includes('error id=') || line.trim() === '') {
          // End of multi-line response, resolve with accumulated lines
          this.commandQueue.shift();
          pending.resolve(pending.responseLines.join('\n'));
        } else {
          // Accumulate the line
          pending.responseLines.push(line);
        }
      } else {
        // Single-line response, resolve immediately
        this.commandQueue.shift();
        pending.resolve(line);
      }
    }
  }

  private parseKeyValue(line: string): Record<string, string> {
    const result: Record<string, string> = {};
    const parts = line.split(' ');
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx > 0) {
        const key = part.substring(0, idx);
        const value = part.substring(idx + 1);
        result[key] = value;
      }
    }
    return result;
  }

  // Commands that return multi-line responses
  private static readonly MULTI_LINE_COMMANDS = ['clientlist', 'channellist', 'clientdbinfo', 'channeldbinfo'];

  private isMultiLineCommand(command: string): boolean {
    const cmd = command.trim().toLowerCase();
    return TS6Query.MULTI_LINE_COMMANDS.some(m => cmd.startsWith(m));
  }

  private async sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Not connected'));
        return;
      }

      const isMultiLine = this.isMultiLineCommand(command);
      logger.debug(`Sending: ${command} (multi-line: ${isMultiLine})`);
      this.client.write(command + '\n');

      // Add to command queue and wait for response
      const pending: PendingCommand = {
        resolve,
        reject,
        command,
        startTime: Date.now(),
        responseLines: [],
        isMultiLine
      };
      this.commandQueue.push(pending);

      // Timeout if no response within 5 seconds
      const timeoutId = setTimeout(() => {
        const index = this.commandQueue.indexOf(pending);
        if (index !== -1) {
          this.commandQueue.splice(index, 1);
          reject(new Error(`Command timeout: ${command}`));
        }
      }, 5000);

      // Clear timeout on resolve
      const originalResolve = pending.resolve;
      if (isMultiLine) {
        pending.resolve = (_value: string) => {
          clearTimeout(timeoutId);
          // Join all accumulated lines
          originalResolve(pending.responseLines.join('\n'));
        };
      } else {
        pending.resolve = (value: string) => {
          clearTimeout(timeoutId);
          originalResolve(value);
        };
      }
    });
  }

  async getServerInfo(): Promise<ServerInfo> {
    if (!this.connected) {
      throw new Error('Not connected to TeamSpeak server');
    }

    try {
      const response = await this.sendCommand('serverinfo');
      const data = this.parseKeyValue(response);
      
      return {
        virtualserver_name: data.virtualserver_name || 'Unknown',
        virtualserver_version: data.virtualserver_version || 'Unknown',
        virtualserver_clientsonline: parseInt(data.virtualserver_clientsonline || '0'),
        virtualserver_channelsonline: parseInt(data.virtualserver_channelsonline || '0'),
        ...data
      };
    } catch (error) {
      logger.error('Failed to get server info:', error);
      throw error;
    }
  }

  async getClientList(): Promise<TSClient[]> {
    if (!this.connected) {
      throw new Error('Not connected to TeamSpeak server');
    }

    try {
      const response = await this.sendCommand('clientlist');
      
      // Parse all lines (multi-line response)
      const lines = response.split('\n').filter(line => line.trim());
      const clients: TSClient[] = [];
      
      for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) continue;
        
        const data = this.parseKeyValue(line);
        if (data.clid) {
          clients.push({
            clid: parseInt(data.clid),
            client_nickname: data.client_nickname || 'Unknown',
            client_type: parseInt(data.client_type || '0'),
            ...data
          });
        }
      }
      
      return clients;
    } catch (error) {
      logger.error('Failed to get client list:', error);
      throw error;
    }
  }

  async getChannelList(): Promise<TSChannel[]> {
    if (!this.connected) {
      throw new Error('Not connected to TeamSpeak server');
    }

    try {
      const response = await this.sendCommand('channellist');
      
      // Parse all lines (multi-line response)
      const lines = response.split('\n').filter(line => line.trim());
      const channels: TSChannel[] = [];
      
      for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) continue;
        
        const data = this.parseKeyValue(line);
        if (data.cid) {
          channels.push({
            cid: parseInt(data.cid),
            channel_name: data.channel_name || 'Unknown',
            channel_order: parseInt(data.channel_order || '0'),
            ...data
          });
        }
      }
      
      return channels;
    } catch (error) {
      logger.error('Failed to get channel list:', error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.sendCommand('quit');
      } catch {
        // Ignore errors on disconnect
      }
      this.client.end();
      this.connected = false;
      logger.info('Disconnected from TeamSpeak ServerQuery');
    }
  }
}
