import { Pool as PgPool, PoolConfig as PgPoolConfig, QueryResult } from 'pg';
import mysql from 'mysql2/promise';
import sqlite3 from 'sqlite3';
import { open, Database as SqliteDatabase } from 'sqlite';
import { MongoClient, Db, Document } from 'mongodb';
import {
	Connector,
	IntegrationStatus,
	DatabaseConnectorConfig,
	DatabaseConnectorConfigSchema,
	DatabaseType,
	DatabaseQueryOptions,
	DatabaseQueryOptionsSchema,
} from '../types';

interface DatabaseConnection {
	query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
	execute(sql: string, params?: unknown[]): Promise<void>;
	beginTransaction(): Promise<void>;
	commit(): Promise<void>;
	rollback(): Promise<void>;
	close(): Promise<void>;
}

/**
 * PostgreSQL Connection
 */
class PostgreSQLConnection implements DatabaseConnection {
	private pool: PgPool;
	private client?: PgPool['Client'];

	constructor(config: DatabaseConnectorConfig) {
		const poolConfig: PgPoolConfig = {
			host: config.host,
			port: config.port,
			database: config.database,
			user: config.username,
			password: config.password,
			ssl: config.ssl ? { rejectUnauthorized: false } : false,
			max: config.poolSize,
			connectionTimeoutMillis: config.connectionTimeout,
		};

		this.pool = new PgPool(poolConfig);
	}

	async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
		const result: QueryResult = await this.pool.query(sql, params);
		return result.rows as T[];
	}

	async execute(sql: string, params?: unknown[]): Promise<void> {
		await this.pool.query(sql, params);
	}

	async beginTransaction(): Promise<void> {
		this.client = await this.pool.connect();
		await this.client.query('BEGIN');
	}

	async commit(): Promise<void> {
		if (!this.client) throw new Error('No active transaction');
		await this.client.query('COMMIT');
		this.client.release();
		this.client = undefined;
	}

	async rollback(): Promise<void> {
		if (!this.client) throw new Error('No active transaction');
		await this.client.query('ROLLBACK');
		this.client.release();
		this.client = undefined;
	}

	async close(): Promise<void> {
		await this.pool.end();
	}
}

/**
 * MySQL Connection
 */
class MySQLConnection implements DatabaseConnection {
	private pool: mysql.Pool;
	private connection?: mysql.PoolConnection;

	constructor(config: DatabaseConnectorConfig) {
		this.pool = mysql.createPool({
			host: config.host,
			port: config.port,
			database: config.database,
			user: config.username,
			password: config.password,
			ssl: config.ssl ? {} : undefined,
			connectionLimit: config.poolSize,
			connectTimeout: config.connectionTimeout,
		});
	}

	async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
		const [rows] = await this.pool.execute(sql, params);
		return rows as T[];
	}

	async execute(sql: string, params?: unknown[]): Promise<void> {
		await this.pool.execute(sql, params);
	}

	async beginTransaction(): Promise<void> {
		this.connection = await this.pool.getConnection();
		await this.connection.beginTransaction();
	}

	async commit(): Promise<void> {
		if (!this.connection) throw new Error('No active transaction');
		await this.connection.commit();
		this.connection.release();
		this.connection = undefined;
	}

	async rollback(): Promise<void> {
		if (!this.connection) throw new Error('No active transaction');
		await this.connection.rollback();
		this.connection.release();
		this.connection = undefined;
	}

	async close(): Promise<void> {
		await this.pool.end();
	}
}

/**
 * SQLite Connection
 */
class SQLiteConnection implements DatabaseConnection {
	private db?: SqliteDatabase;
	private config: DatabaseConnectorConfig;

	constructor(config: DatabaseConnectorConfig) {
		this.config = config;
	}

	async connect(): Promise<void> {
		this.db = await open({
			filename: this.config.database,
			driver: sqlite3.Database,
		});
	}

	async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
		if (!this.db) throw new Error('Database not connected');
		return (await this.db.all(sql, params)) as T[];
	}

	async execute(sql: string, params?: unknown[]): Promise<void> {
		if (!this.db) throw new Error('Database not connected');
		await this.db.run(sql, params);
	}

	async beginTransaction(): Promise<void> {
		if (!this.db) throw new Error('Database not connected');
		await this.db.exec('BEGIN TRANSACTION');
	}

	async commit(): Promise<void> {
		if (!this.db) throw new Error('Database not connected');
		await this.db.exec('COMMIT');
	}

	async rollback(): Promise<void> {
		if (!this.db) throw new Error('Database not connected');
		await this.db.exec('ROLLBACK');
	}

	async close(): Promise<void> {
		if (this.db) {
			await this.db.close();
		}
	}
}

/**
 * MongoDB Connection (adapter to DatabaseConnection interface)
 */
class MongoDBConnection implements DatabaseConnection {
	private client: MongoClient;
	private db?: Db;
	private config: DatabaseConnectorConfig;

	constructor(config: DatabaseConnectorConfig) {
		this.config = config;
		const url = `mongodb://${config.username ? `${config.username}:${config.password}@` : ''}${config.host}:${config.port}`;
		this.client = new MongoClient(url, {
			ssl: config.ssl,
			maxPoolSize: config.poolSize,
			connectTimeoutMS: config.connectionTimeout,
		});
	}

	async connect(): Promise<void> {
		await this.client.connect();
		this.db = this.client.db(this.config.database);
	}

	async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
		if (!this.db) throw new Error('Database not connected');

		// Parse MongoDB-style query from SQL-like syntax
		// Format: "collection.find({ query })"
		const match = sql.match(/(\w+)\.(\w+)\((.*)\)/);
		if (!match) throw new Error('Invalid MongoDB query format');

		const [, collection, operation, args] = match;
		const parsedArgs = args ? JSON.parse(args) : {};

		const coll = this.db.collection(collection);

		switch (operation) {
			case 'find':
				return (await coll.find(parsedArgs).toArray()) as T[];
			case 'findOne':
				const result = await coll.findOne(parsedArgs);
				return result ? [result as T] : [];
			case 'aggregate':
				return (await coll.aggregate(parsedArgs).toArray()) as T[];
			default:
				throw new Error(`Unsupported MongoDB operation: ${operation}`);
		}
	}

	async execute(sql: string, params?: unknown[]): Promise<void> {
		if (!this.db) throw new Error('Database not connected');

		// Parse MongoDB-style command
		const match = sql.match(/(\w+)\.(\w+)\((.*)\)/);
		if (!match) throw new Error('Invalid MongoDB command format');

		const [, collection, operation, args] = match;
		const parsedArgs = args ? JSON.parse(args) : {};

		const coll = this.db.collection(collection);

		switch (operation) {
			case 'insertOne':
				await coll.insertOne(parsedArgs as Document);
				break;
			case 'insertMany':
				await coll.insertMany(parsedArgs as Document[]);
				break;
			case 'updateOne':
				await coll.updateOne(parsedArgs.filter as Document, parsedArgs.update as Document);
				break;
			case 'updateMany':
				await coll.updateMany(parsedArgs.filter as Document, parsedArgs.update as Document);
				break;
			case 'deleteOne':
				await coll.deleteOne(parsedArgs as Document);
				break;
			case 'deleteMany':
				await coll.deleteMany(parsedArgs as Document);
				break;
			default:
				throw new Error(`Unsupported MongoDB operation: ${operation}`);
		}
	}

	async beginTransaction(): Promise<void> {
		// MongoDB transactions require sessions
		throw new Error('MongoDB transactions not yet supported in this implementation');
	}

	async commit(): Promise<void> {
		throw new Error('MongoDB transactions not yet supported in this implementation');
	}

	async rollback(): Promise<void> {
		throw new Error('MongoDB transactions not yet supported in this implementation');
	}

	async close(): Promise<void> {
		await this.client.close();
	}
}

/**
 * Database Connector
 * Supports PostgreSQL, MySQL, SQLite, and MongoDB with connection pooling and transactions
 */
export class DatabaseConnector implements Connector {
	private config: DatabaseConnectorConfig;
	private connection?: DatabaseConnection;
	private status: IntegrationStatus;

	constructor(config: DatabaseConnectorConfig) {
		this.config = DatabaseConnectorConfigSchema.parse(config);
		this.status = IntegrationStatus.DISCONNECTED;
	}

	/**
	 * Connect to the database
	 */
	async connect(): Promise<void> {
		try {
			switch (this.config.type) {
				case DatabaseType.POSTGRESQL:
					this.connection = new PostgreSQLConnection(this.config);
					break;

				case DatabaseType.MYSQL:
					this.connection = new MySQLConnection(this.config);
					break;

				case DatabaseType.SQLITE:
					this.connection = new SQLiteConnection(this.config);
					await (this.connection as SQLiteConnection).connect();
					break;

				case DatabaseType.MONGODB:
					this.connection = new MongoDBConnection(this.config);
					await (this.connection as MongoDBConnection).connect();
					break;

				default:
					throw new Error(`Unsupported database type: ${this.config.type}`);
			}

			// Test connection
			await this.test();
			this.status = IntegrationStatus.CONNECTED;
		} catch (error) {
			this.status = IntegrationStatus.ERROR;
			throw new Error(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Disconnect from the database
	 */
	async disconnect(): Promise<void> {
		if (this.connection) {
			await this.connection.close();
			this.connection = undefined;
		}
		this.status = IntegrationStatus.DISCONNECTED;
	}

	/**
	 * Execute a database operation
	 */
	async execute<TInput = unknown, TOutput = unknown>(
		operation: string,
		params: TInput,
	): Promise<TOutput> {
		if (!this.connection) {
			throw new Error('Not connected to database');
		}

		const options = params as unknown as DatabaseQueryOptions;
		const validatedOptions = DatabaseQueryOptionsSchema.parse(options);

		if (validatedOptions.transaction) {
			await this.connection.beginTransaction();
			try {
				const result = await this.connection.query<TOutput>(
					validatedOptions.query,
					validatedOptions.params,
				);
				await this.connection.commit();
				return result as TOutput;
			} catch (error) {
				await this.connection.rollback();
				throw error;
			}
		} else {
			const result = await this.connection.query<TOutput>(
				validatedOptions.query,
				validatedOptions.params,
			);
			return result as TOutput;
		}
	}

	/**
	 * Execute a query
	 */
	async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
		if (!this.connection) {
			throw new Error('Not connected to database');
		}
		return this.connection.query<T>(sql, params);
	}

	/**
	 * Execute a command (INSERT, UPDATE, DELETE)
	 */
	async executeCommand(sql: string, params?: unknown[]): Promise<void> {
		if (!this.connection) {
			throw new Error('Not connected to database');
		}
		await this.connection.execute(sql, params);
	}

	/**
	 * Execute multiple statements in a transaction
	 */
	async transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
		if (!this.connection) {
			throw new Error('Not connected to database');
		}

		await this.connection.beginTransaction();
		try {
			for (const statement of statements) {
				await this.connection.execute(statement.sql, statement.params);
			}
			await this.connection.commit();
		} catch (error) {
			await this.connection.rollback();
			throw error;
		}
	}

	/**
	 * Test the connection
	 */
	async test(): Promise<boolean> {
		if (!this.connection) {
			return false;
		}

		try {
			switch (this.config.type) {
				case DatabaseType.POSTGRESQL:
				case DatabaseType.MYSQL:
					await this.connection.query('SELECT 1');
					break;
				case DatabaseType.SQLITE:
					await this.connection.query('SELECT 1');
					break;
				case DatabaseType.MONGODB:
					// Simple ping for MongoDB
					await this.connection.query('admin.ping({})');
					break;
			}
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get connection status
	 */
	getStatus(): IntegrationStatus {
		return this.status;
	}

	/**
	 * Get database type
	 */
	getDatabaseType(): DatabaseType {
		return this.config.type;
	}
}
