import fs from 'fs/promises';
import path from 'path';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Storage as GCSStorage } from '@google-cloud/storage';
import { BlobServiceClient } from '@azure/storage-blob';
import {
	Connector,
	IntegrationStatus,
	FileConnectorConfig,
	FileConnectorConfigSchema,
	FileStorageType,
	FileInfo,
	FileOperationOptions,
	FileOperationOptionsSchema,
} from '../types';
import { Readable } from 'stream';

interface FileStorage {
	read(filePath: string, options?: FileOperationOptions): Promise<Buffer>;
	write(filePath: string, data: Buffer, options?: FileOperationOptions): Promise<void>;
	list(directory: string): Promise<FileInfo[]>;
	delete(filePath: string): Promise<void>;
	exists(filePath: string): Promise<boolean>;
}

/**
 * Local File Storage
 */
class LocalFileStorage implements FileStorage {
	private basePath: string;

	constructor(basePath: string) {
		this.basePath = basePath;
	}

	async read(filePath: string, options?: FileOperationOptions): Promise<Buffer> {
		const fullPath = path.join(this.basePath, filePath);
		const opts = options ? FileOperationOptionsSchema.parse(options) : { encoding: 'utf-8', createIfNotExists: false, overwrite: false };
		return Buffer.from(await fs.readFile(fullPath, { encoding: opts.encoding as BufferEncoding }));
	}

	async write(filePath: string, data: Buffer, options?: FileOperationOptions): Promise<void> {
		const fullPath = path.join(this.basePath, filePath);
		const opts = options ? FileOperationOptionsSchema.parse(options) : { encoding: 'utf-8', createIfNotExists: false, overwrite: false };

		// Check if file exists
		const exists = await this.exists(filePath);
		if (exists && !opts.overwrite) {
			throw new Error(`File already exists: ${filePath}`);
		}

		// Create directory if needed
		const dir = path.dirname(fullPath);
		await fs.mkdir(dir, { recursive: true });

		await fs.writeFile(fullPath, data, { encoding: opts.encoding as BufferEncoding });
	}

	async list(directory: string): Promise<FileInfo[]> {
		const fullPath = path.join(this.basePath, directory);
		const entries = await fs.readdir(fullPath, { withFileTypes: true });

		const fileInfos: FileInfo[] = [];
		for (const entry of entries) {
			const entryPath = path.join(fullPath, entry.name);
			const stats = await fs.stat(entryPath);

			fileInfos.push({
				path: path.join(directory, entry.name),
				name: entry.name,
				size: stats.size,
				type: entry.isDirectory() ? 'directory' : 'file',
				lastModified: stats.mtime,
				isDirectory: entry.isDirectory(),
			});
		}

		return fileInfos;
	}

	async delete(filePath: string): Promise<void> {
		const fullPath = path.join(this.basePath, filePath);
		await fs.unlink(fullPath);
	}

	async exists(filePath: string): Promise<boolean> {
		const fullPath = path.join(this.basePath, filePath);
		try {
			await fs.access(fullPath);
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * AWS S3 Storage
 */
class S3FileStorage implements FileStorage {
	private client: S3Client;
	private bucket: string;

	constructor(bucket: string, region: string, credentials?: { accessKeyId: string; secretAccessKey: string }) {
		this.bucket = bucket;
		this.client = new S3Client({
			region,
			credentials,
		});
	}

	async read(filePath: string): Promise<Buffer> {
		const command = new GetObjectCommand({
			Bucket: this.bucket,
			Key: filePath,
		});

		const response = await this.client.send(command);
		if (!response.Body) {
			throw new Error('Empty response body');
		}

		return Buffer.from(await response.Body.transformToByteArray());
	}

	async write(filePath: string, data: Buffer): Promise<void> {
		const command = new PutObjectCommand({
			Bucket: this.bucket,
			Key: filePath,
			Body: data,
		});

		await this.client.send(command);
	}

	async list(directory: string): Promise<FileInfo[]> {
		const command = new ListObjectsV2Command({
			Bucket: this.bucket,
			Prefix: directory,
		});

		const response = await this.client.send(command);
		if (!response.Contents) {
			return [];
		}

		return response.Contents.map((item) => ({
			path: item.Key || '',
			name: path.basename(item.Key || ''),
			size: item.Size || 0,
			type: 'file',
			lastModified: item.LastModified || new Date(),
			isDirectory: false,
		}));
	}

	async delete(filePath: string): Promise<void> {
		const command = new DeleteObjectCommand({
			Bucket: this.bucket,
			Key: filePath,
		});

		await this.client.send(command);
	}

	async exists(filePath: string): Promise<boolean> {
		try {
			await this.read(filePath);
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Google Cloud Storage
 */
class GCSFileStorage implements FileStorage {
	private storage: GCSStorage;
	private bucket: string;

	constructor(bucket: string, credentials?: Record<string, unknown>) {
		this.bucket = bucket;
		this.storage = new GCSStorage(credentials);
	}

	async read(filePath: string): Promise<Buffer> {
		const file = this.storage.bucket(this.bucket).file(filePath);
		const [contents] = await file.download();
		return contents;
	}

	async write(filePath: string, data: Buffer): Promise<void> {
		const file = this.storage.bucket(this.bucket).file(filePath);
		await file.save(data);
	}

	async list(directory: string): Promise<FileInfo[]> {
		const [files] = await this.storage.bucket(this.bucket).getFiles({
			prefix: directory,
		});

		return files.map((file) => ({
			path: file.name,
			name: path.basename(file.name),
			size: Number(file.metadata.size),
			type: 'file',
			lastModified: new Date(file.metadata.updated),
			isDirectory: false,
		}));
	}

	async delete(filePath: string): Promise<void> {
		const file = this.storage.bucket(this.bucket).file(filePath);
		await file.delete();
	}

	async exists(filePath: string): Promise<boolean> {
		const file = this.storage.bucket(this.bucket).file(filePath);
		const [exists] = await file.exists();
		return exists;
	}
}

/**
 * Azure Blob Storage
 */
class AzureBlobStorage implements FileStorage {
	private blobServiceClient: BlobServiceClient;
	private containerName: string;

	constructor(containerName: string, connectionString: string) {
		this.containerName = containerName;
		this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
	}

	async read(filePath: string): Promise<Buffer> {
		const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
		const blobClient = containerClient.getBlobClient(filePath);
		const downloadResponse = await blobClient.download();

		if (!downloadResponse.readableStreamBody) {
			throw new Error('Empty response body');
		}

		const chunks: Buffer[] = [];
		const readable = downloadResponse.readableStreamBody as Readable;

		return new Promise((resolve, reject) => {
			readable.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
			readable.on('end', () => resolve(Buffer.concat(chunks)));
			readable.on('error', reject);
		});
	}

	async write(filePath: string, data: Buffer): Promise<void> {
		const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
		const blockBlobClient = containerClient.getBlockBlobClient(filePath);
		await blockBlobClient.upload(data, data.length);
	}

	async list(directory: string): Promise<FileInfo[]> {
		const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
		const fileInfos: FileInfo[] = [];

		for await (const blob of containerClient.listBlobsFlat({ prefix: directory })) {
			fileInfos.push({
				path: blob.name,
				name: path.basename(blob.name),
				size: blob.properties.contentLength || 0,
				type: 'file',
				lastModified: blob.properties.lastModified || new Date(),
				isDirectory: false,
			});
		}

		return fileInfos;
	}

	async delete(filePath: string): Promise<void> {
		const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
		const blobClient = containerClient.getBlobClient(filePath);
		await blobClient.delete();
	}

	async exists(filePath: string): Promise<boolean> {
		const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
		const blobClient = containerClient.getBlobClient(filePath);
		return blobClient.exists();
	}
}

/**
 * File Connector
 * Supports local, S3, GCS, and Azure Blob storage
 */
export class FileConnector implements Connector {
	private config: FileConnectorConfig;
	private storage?: FileStorage;
	private status: IntegrationStatus;

	constructor(config: FileConnectorConfig) {
		this.config = FileConnectorConfigSchema.parse(config);
		this.status = IntegrationStatus.DISCONNECTED;
	}

	/**
	 * Connect to the file storage
	 */
	async connect(): Promise<void> {
		try {
			switch (this.config.type) {
				case FileStorageType.LOCAL:
					this.storage = new LocalFileStorage(this.config.basePath || '/tmp');
					break;

				case FileStorageType.S3:
					if (!this.config.bucket || !this.config.region) {
						throw new Error('S3 requires bucket and region');
					}
					this.storage = new S3FileStorage(
						this.config.bucket,
						this.config.region,
						this.config.credentials as { accessKeyId: string; secretAccessKey: string } | undefined,
					);
					break;

				case FileStorageType.GCS:
					if (!this.config.bucket) {
						throw new Error('GCS requires bucket');
					}
					this.storage = new GCSFileStorage(this.config.bucket, this.config.credentials);
					break;

				case FileStorageType.AZURE_BLOB:
					if (!this.config.bucket || !this.config.credentials?.connectionString) {
						throw new Error('Azure Blob requires container and connection string');
					}
					this.storage = new AzureBlobStorage(
						this.config.bucket,
						this.config.credentials.connectionString as string,
					);
					break;

				default:
					throw new Error(`Unsupported file storage type: ${this.config.type}`);
			}

			this.status = IntegrationStatus.CONNECTED;
		} catch (error) {
			this.status = IntegrationStatus.ERROR;
			throw new Error(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Disconnect from the file storage
	 */
	async disconnect(): Promise<void> {
		this.storage = undefined;
		this.status = IntegrationStatus.DISCONNECTED;
	}

	/**
	 * Execute a file operation
	 */
	async execute<TInput = unknown, TOutput = unknown>(
		operation: string,
		params: TInput,
	): Promise<TOutput> {
		if (!this.storage) {
			throw new Error('Not connected to file storage');
		}

		const { method, path: filePath, data, options } = params as {
			method: 'read' | 'write' | 'list' | 'delete' | 'exists';
			path: string;
			data?: Buffer;
			options?: FileOperationOptions;
		};

		switch (method) {
			case 'read':
				return (await this.storage.read(filePath, options)) as TOutput;
			case 'write':
				if (!data) throw new Error('Data required for write operation');
				await this.storage.write(filePath, data, options);
				return undefined as TOutput;
			case 'list':
				return (await this.storage.list(filePath)) as TOutput;
			case 'delete':
				await this.storage.delete(filePath);
				return undefined as TOutput;
			case 'exists':
				return (await this.storage.exists(filePath)) as TOutput;
			default:
				throw new Error(`Unsupported operation: ${method}`);
		}
	}

	/**
	 * Read a file
	 */
	async read(filePath: string, options?: FileOperationOptions): Promise<Buffer> {
		if (!this.storage) {
			throw new Error('Not connected to file storage');
		}
		return this.storage.read(filePath, options);
	}

	/**
	 * Write a file
	 */
	async write(filePath: string, data: Buffer, options?: FileOperationOptions): Promise<void> {
		if (!this.storage) {
			throw new Error('Not connected to file storage');
		}
		await this.storage.write(filePath, data, options);
	}

	/**
	 * List files in a directory
	 */
	async list(directory: string): Promise<FileInfo[]> {
		if (!this.storage) {
			throw new Error('Not connected to file storage');
		}
		return this.storage.list(directory);
	}

	/**
	 * Delete a file
	 */
	async delete(filePath: string): Promise<void> {
		if (!this.storage) {
			throw new Error('Not connected to file storage');
		}
		await this.storage.delete(filePath);
	}

	/**
	 * Check if a file exists
	 */
	async exists(filePath: string): Promise<boolean> {
		if (!this.storage) {
			throw new Error('Not connected to file storage');
		}
		return this.storage.exists(filePath);
	}

	/**
	 * Test the connection
	 */
	async test(): Promise<boolean> {
		try {
			await this.connect();
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
}
