import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { SimulationEngine, type WorkflowDefinition } from './engine';
import { ExecutionRecorder, RecordingManager } from './recorder';
import { PlaybackEngine } from './playback';
import { LoadTestRunner } from './load';
import { PredefinedScenarios } from './scenarios';
import { SimulationConfigSchema, LoadTestConfigSchema, PlaybackConfigSchema } from './types';

/**
 * Simulation REST API
 * Provides HTTP endpoints for simulation functionality
 */

export class SimulationAPI {
	private engine: SimulationEngine;
	private recorder: ExecutionRecorder;
	private recordingManager: RecordingManager;
	private playbackEngine: PlaybackEngine;
	private loadTestRunner: LoadTestRunner;

	constructor() {
		this.engine = new SimulationEngine();
		this.recorder = new ExecutionRecorder();
		this.recordingManager = new RecordingManager();
		this.playbackEngine = new PlaybackEngine();
		this.loadTestRunner = new LoadTestRunner();
	}

	/**
	 * Register API routes
	 */
	registerRoutes(app: Express): void {
		// Simulation endpoints
		app.post('/api/simulation/run', this.runSimulation.bind(this));
		app.post('/api/simulation/batch', this.runBatch.bind(this));
		app.get('/api/simulation/:id', this.getSimulation.bind(this));
		app.delete('/api/simulation/:id', this.deleteSimulation.bind(this));

		// Recording endpoints
		app.post('/api/simulation/record/start', this.startRecording.bind(this));
		app.post('/api/simulation/record/stop', this.stopRecording.bind(this));
		app.get('/api/simulation/recordings', this.listRecordings.bind(this));
		app.get('/api/simulation/recordings/:id', this.getRecording.bind(this));
		app.delete('/api/simulation/recordings/:id', this.deleteRecording.bind(this));

		// Playback endpoints
		app.post('/api/simulation/playback', this.playbackRecording.bind(this));

		// Scenario endpoints
		app.get('/api/simulation/scenarios', this.listScenarios.bind(this));
		app.get('/api/simulation/scenarios/:id', this.getScenario.bind(this));
		app.post('/api/simulation/scenarios', this.createScenario.bind(this));

		// Load test endpoints
		app.post('/api/simulation/load-test', this.runLoadTest.bind(this));
		app.get('/api/simulation/load-test/:id', this.getLoadTestResult.bind(this));
	}

	/**
	 * POST /api/simulation/run
	 * Run a simulation
	 */
	private async runSimulation(req: Request, res: Response): Promise<void> {
		try {
			const schema = z.object({
				workflow: z.object({
					id: z.string(),
					name: z.string(),
					nodes: z.array(
						z.object({
							id: z.string(),
							type: z.string(),
							parameters: z.record(z.unknown()),
						}),
					),
					connections: z.record(z.unknown()),
				}),
				config: SimulationConfigSchema,
			});

			const { workflow, config } = schema.parse(req.body);

			const result = await this.engine.run(workflow as WorkflowDefinition, config);

			res.json({
				success: true,
				data: result,
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /api/simulation/batch
	 * Run simulations for multiple workflows
	 */
	private async runBatch(req: Request, res: Response): Promise<void> {
		try {
			const schema = z.object({
				workflows: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						nodes: z.array(z.object({ id: z.string(), type: z.string(), parameters: z.record(z.unknown()) })),
						connections: z.record(z.unknown()),
					}),
				),
				config: SimulationConfigSchema,
			});

			const { workflows, config } = schema.parse(req.body);

			const result = await this.engine.runBatch(workflows as WorkflowDefinition[], config);

			res.json({
				success: true,
				data: result,
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /api/simulation/:id
	 * Get simulation result by ID
	 */
	private async getSimulation(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;

			// In real implementation, fetch from database
			res.status(404).json({
				success: false,
				error: 'Not implemented',
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * DELETE /api/simulation/:id
	 * Delete simulation result
	 */
	private async deleteSimulation(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;

			// In real implementation, delete from database
			res.json({
				success: true,
				message: 'Simulation deleted',
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /api/simulation/record/start
	 * Start recording an execution
	 */
	private async startRecording(req: Request, res: Response): Promise<void> {
		try {
			const schema = z.object({
				workflowId: z.string(),
				executionId: z.string(),
			});

			const { workflowId, executionId } = schema.parse(req.body);

			this.recorder.start(workflowId, executionId);

			res.json({
				success: true,
				data: {
					recordingId: this.recorder.getCurrentRecordingId(),
					status: 'recording',
				},
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /api/simulation/record/stop
	 * Stop recording and save
	 */
	private async stopRecording(req: Request, res: Response): Promise<void> {
		try {
			const recording = await this.recorder.stop();
			await this.recordingManager.save(recording);

			res.json({
				success: true,
				data: recording,
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /api/simulation/recordings
	 * List all recordings
	 */
	private async listRecordings(req: Request, res: Response): Promise<void> {
		try {
			const recordings = await this.recordingManager.list();

			res.json({
				success: true,
				data: recordings,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /api/simulation/recordings/:id
	 * Get recording by ID
	 */
	private async getRecording(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const recording = await this.recordingManager.get(id);

			if (!recording) {
				res.status(404).json({
					success: false,
					error: 'Recording not found',
				});
				return;
			}

			res.json({
				success: true,
				data: recording,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * DELETE /api/simulation/recordings/:id
	 * Delete recording
	 */
	private async deleteRecording(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			await this.recordingManager.delete(id);

			res.json({
				success: true,
				message: 'Recording deleted',
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /api/simulation/playback
	 * Playback a recording
	 */
	private async playbackRecording(req: Request, res: Response): Promise<void> {
		try {
			const schema = z.object({
				recordingId: z.string(),
				config: PlaybackConfigSchema,
			});

			const { recordingId, config } = schema.parse(req.body);

			const recording = await this.recordingManager.get(recordingId);
			if (!recording) {
				res.status(404).json({
					success: false,
					error: 'Recording not found',
				});
				return;
			}

			const result = await this.playbackEngine.play(recording, config);

			res.json({
				success: true,
				data: result,
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /api/simulation/scenarios
	 * List all scenarios
	 */
	private async listScenarios(req: Request, res: Response): Promise<void> {
		try {
			const { workflowId } = req.query;

			if (!workflowId || typeof workflowId !== 'string') {
				res.status(400).json({
					success: false,
					error: 'workflowId is required',
				});
				return;
			}

			const scenarios = PredefinedScenarios.getAll(workflowId);

			res.json({
				success: true,
				data: scenarios,
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /api/simulation/scenarios/:id
	 * Get scenario by ID
	 */
	private async getScenario(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;

			// In real implementation, fetch from database
			res.status(404).json({
				success: false,
				error: 'Not implemented',
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /api/simulation/scenarios
	 * Create a new scenario
	 */
	private async createScenario(req: Request, res: Response): Promise<void> {
		try {
			// In real implementation, save to database
			res.status(501).json({
				success: false,
				error: 'Not implemented',
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * POST /api/simulation/load-test
	 * Run a load test
	 */
	private async runLoadTest(req: Request, res: Response): Promise<void> {
		try {
			const schema = z.object({
				config: LoadTestConfigSchema,
			});

			const { config } = schema.parse(req.body);

			// Mock executor for demonstration
			const executor = async () => {
				const delay = Math.random() * 100;
				await new Promise((resolve) => setTimeout(resolve, delay));
				return { success: Math.random() > 0.05, duration: delay };
			};

			const result = await this.loadTestRunner.run(executor, config);

			res.json({
				success: true,
				data: result,
			});
		} catch (error) {
			res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * GET /api/simulation/load-test/:id
	 * Get load test result
	 */
	private async getLoadTestResult(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;

			// In real implementation, fetch from database
			res.status(404).json({
				success: false,
				error: 'Not implemented',
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}
}
