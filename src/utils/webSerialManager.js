/**
 * Web Serial API Controller and Session Manager
 * Provides reliable bidirectional serial communication, throttled macro streaming,
 * hardware break signals, and clean port release.
 */

/**
 * Checks if the current browser environment supports the Web Serial API.
 * @returns {boolean}
 */
export function isWebSerialSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.serial);
}

/**
 * Checks if the current execution context satisfies Web Serial security requirements
 * (HTTPS or localhost / 127.0.0.1).
 * @returns {boolean}
 */
export function isSecureContextCheck() {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location?.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * Session manager for a Web Serial port connection.
 */
export class WebSerialSession {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readableStreamClosed = null;
    this.writableStreamClosed = null;
    this.listeners = new Set();
    this.sessionLog = '';
    this.isConnected = false;
    this.isStreaming = false;
    this._maxLogSize = 2 * 1024 * 1024; // 2MB max log in memory
  }

  /**
   * Prompts the user to select a serial port from the system dialog.
   * @returns {Promise<SerialPort>}
   */
  async requestPort() {
    if (!isWebSerialSupported()) {
      throw new Error('Web Serial API не поддерживается данным браузером');
    }
    this.port = await navigator.serial.requestPort();
    return this.port;
  }

  /**
   * Connects to a serial port with specified UART parameters.
   * @param {Object} options
   * @param {SerialPort} [options.port] - Optional specific port instance
   * @param {number} [options.baudRate] - e.g. 9600, 115200
   * @param {number} [options.dataBits] - 8, 7
   * @param {number} [options.stopBits] - 1, 2
   * @param {string} [options.parity] - 'none' | 'even' | 'odd'
   * @param {string} [options.flowControl] - 'none' | 'hardware'
   */
  async connect(options = {}) {
    const {
      port = this.port,
      baudRate = 9600,
      dataBits = 8,
      stopBits = 1,
      parity = 'none',
      flowControl = 'none'
    } = options;

    const targetPort = port || this.port;
    if (!targetPort) {
      throw new Error('Порт не выбран');
    }

    this.port = targetPort;

    // Open port with parameters
    await this.port.open({
      baudRate: Number(baudRate) || 9600,
      dataBits: Number(dataBits) || 8,
      stopBits: Number(stopBits) || 1,
      parity,
      flowControl
    });

    this.isConnected = true;

    // Set up text encoder for writing
    if (typeof TextEncoderStream !== 'undefined') {
      const textEncoder = new TextEncoderStream();
      this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
      this.writer = textEncoder.writable.getWriter();
    }

    // Set up text decoder for reading
    if (typeof TextDecoderStream !== 'undefined') {
      const textDecoder = new TextDecoderStream();
      this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();
      this._startReadLoop();
    }
  }

  /**
   * Internal read loop handling incoming chunks.
   * @private
   */
  async _startReadLoop() {
    try {
      while (this.isConnected && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.appendToLog(value);
          this._notifyListeners(value);
        }
      }
    } catch (err) {
      // Stream cancellation or disconnect error
      if (this.isConnected) {
        console.warn('WebSerial read loop exception:', err);
      }
    }
  }

  /**
   * Disconnects and releases port locks cleanly.
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.isConnected = false;

    try {
      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        if (this.readableStreamClosed) {
          await this.readableStreamClosed.catch(() => {});
        }
        this.reader = null;
        this.readableStreamClosed = null;
      }

      if (this.writer) {
        await this.writer.close().catch(() => {});
        if (this.writableStreamClosed) {
          await this.writableStreamClosed.catch(() => {});
        }
        this.writer = null;
        this.writableStreamClosed = null;
      }

      if (this.port) {
        await this.port.close().catch(() => {});
        this.port = null;
      }
    } catch (err) {
      console.warn('Error during serial port disconnect:', err);
    }
  }

  /**
   * Writes raw text to the serial port.
   * @param {string} data
   * @returns {Promise<void>}
   */
  async write(data) {
    if (!this.writer) {
      throw new Error('Порт не открыт для записи');
    }
    await this.writer.write(data);
  }

  /**
   * Sends a hardware Break signal (250ms) to trigger bootloader / password recovery.
   * @param {number} [durationMs] - Duration of break signal in ms (default 250ms)
   * @returns {Promise<void>}
   */
  async sendBreak(durationMs = 250) {
    if (!this.port || !this.port.setSignals) {
      throw new Error('Управление аппаратными сигналами недоступно на данном порту');
    }
    await this.port.setSignals({ break: true });
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await this.port.setSignals({ break: false });
  }

  /**
   * Streams a batch of configuration commands line by line with throttling.
   * @param {Object} options
   * @param {string} options.commands - Multiline configuration string
   * @param {number} [options.lineDelayMs] - Delay between lines in ms (default 60ms)
   * @param {Function} [options.onProgress] - (currentLine, totalLines, lineText) => void
   * @param {AbortSignal} [options.signal] - Optional cancellation signal
   * @returns {Promise<{ total: number, sent: number, aborted: boolean }>}
   */
  async streamConfig({
    commands = '',
    lineDelayMs = 60,
    onProgress = null,
    signal = null
  }) {
    if (!commands || typeof commands !== 'string') {
      return { total: 0, sent: 0, aborted: false };
    }

    const lines = commands
      .split(/\r?\n/)
      .map(l => l.trimEnd())
      .filter(l => l.length > 0);

    const total = lines.length;
    let sent = 0;
    this.isStreaming = true;

    try {
      for (let i = 0; i < total; i++) {
        if (signal?.aborted) {
          return { total, sent, aborted: true };
        }

        const line = lines[i];
        await this.write(line + '\r\n');
        sent++;

        if (typeof onProgress === 'function') {
          onProgress(sent, total, line);
        }

        if (i < total - 1 && lineDelayMs > 0) {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, lineDelayMs);
            if (signal) {
              const onAbort = () => {
                clearTimeout(timeout);
                signal.removeEventListener('abort', onAbort);
                resolve();
              };
              signal.addEventListener('abort', onAbort);
            }
          });
        }
      }

      return { total, sent, aborted: false };
    } finally {
      this.isStreaming = false;
    }
  }

  /**
   * Appends incoming data chunk to the internal session log.
   * @param {string} chunk
   */
  appendToLog(chunk) {
    if (!chunk) return;
    this.sessionLog += chunk;
    if (this.sessionLog.length > this._maxLogSize) {
      this.sessionLog = this.sessionLog.slice(-this._maxLogSize);
    }
  }

  /**
   * Returns complete recorded session log text.
   * @returns {string}
   */
  getSessionLog() {
    return this.sessionLog;
  }

  /**
   * Clears internal session log.
   */
  clearSessionLog() {
    this.sessionLog = '';
  }

  /**
   * Subscribes to incoming terminal text chunks.
   * @param {Function} callback - (data: string) => void
   * @returns {Function} Unsubscribe callback
   */
  onData(callback) {
    if (typeof callback !== 'function') return () => {};
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Dispatches data to subscribers.
   * @private
   */
  _notifyListeners(data) {
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (err) {
        console.error('Error in onData listener:', err);
      }
    }
  }
}
