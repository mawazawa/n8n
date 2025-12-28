/**
 * Android Secure Storage
 * Generate Android EncryptedSharedPreferences and Room database code
 */

import type { GeneratedSDKFile, SDKGenerationOptions } from '../types';

/**
 * Generate Android storage components
 */
export function generateAndroidStorage(options: SDKGenerationOptions): GeneratedSDKFile {
	const packagePath = options.packageName.replace(/-/g, '.');

	const content = `package ${packagePath}.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Storage manager for secure data persistence
 */
class StorageManager(
    private val context: Context,
    private val encryptionEnabled: Boolean = true
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val masterKey: MasterKey by lazy {
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private val securePrefs: SharedPreferences by lazy {
        if (encryptionEnabled) {
            EncryptedSharedPreferences.create(
                context,
                "secure_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } else {
            context.getSharedPreferences("prefs", Context.MODE_PRIVATE)
        }
    }

    private val regularPrefs: SharedPreferences by lazy {
        context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
    }

    /**
     * Save sensitive data securely
     */
    fun saveSecure(key: String, value: String) {
        securePrefs.edit().putString(key, value).apply()
    }

    /**
     * Load sensitive data securely
     */
    fun loadSecure(key: String): String? {
        return securePrefs.getString(key, null)
    }

    /**
     * Save Serializable object securely
     */
    inline fun <reified T> saveSecure(key: String, value: T) {
        val jsonString = json.encodeToString(value)
        saveSecure(key, jsonString)
    }

    /**
     * Load Serializable object securely
     */
    inline fun <reified T> loadSecure(key: String): T? {
        val jsonString = loadSecure(key) ?: return null
        return try {
            json.decodeFromString<T>(jsonString)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Delete secure data
     */
    fun delete(key: String) {
        securePrefs.edit().remove(key).apply()
    }

    /**
     * Save preference
     */
    fun setPreference(key: String, value: Any) {
        regularPrefs.edit().apply {
            when (value) {
                is String -> putString(key, value)
                is Int -> putInt(key, value)
                is Long -> putLong(key, value)
                is Float -> putFloat(key, value)
                is Boolean -> putBoolean(key, value)
                else -> throw IllegalArgumentException("Unsupported type")
            }
            apply()
        }
    }

    /**
     * Get preference
     */
    inline fun <reified T> getPreference(key: String, defaultValue: T): T {
        return when (T::class) {
            String::class -> regularPrefs.getString(key, defaultValue as String) as T
            Int::class -> regularPrefs.getInt(key, defaultValue as Int) as T
            Long::class -> regularPrefs.getLong(key, defaultValue as Long) as T
            Float::class -> regularPrefs.getFloat(key, defaultValue as Float) as T
            Boolean::class -> regularPrefs.getBoolean(key, defaultValue as Boolean) as T
            else -> throw IllegalArgumentException("Unsupported type")
        }
    }

    /**
     * Remove preference
     */
    fun removePreference(key: String) {
        regularPrefs.edit().remove(key).apply()
    }

    /**
     * Clear all storage
     */
    fun clearAll() {
        securePrefs.edit().clear().apply()
        regularPrefs.edit().clear().apply()
    }
}

/**
 * Room database for offline data
 */
@androidx.room.Database(
    entities = [WorkflowEntity::class, ExecutionEntity::class],
    version = 1
)
abstract class AppDatabase : androidx.room.RoomDatabase() {
    abstract fun workflowDao(): WorkflowDao
    abstract fun executionDao(): ExecutionDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return instance ?: synchronized(this) {
                instance ?: buildDatabase(context).also {
                    instance = it
                }
            }
        }

        private fun buildDatabase(context: Context): AppDatabase {
            return androidx.room.Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "app_database"
            )
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}

/**
 * Workflow entity
 */
@androidx.room.Entity(tableName = "workflows")
data class WorkflowEntity(
    @androidx.room.PrimaryKey
    val id: String,
    val name: String,
    val description: String?,
    val active: Boolean,
    val createdAt: Long,
    val updatedAt: Long
)

/**
 * Workflow DAO
 */
@androidx.room.Dao
interface WorkflowDao {
    @androidx.room.Query("SELECT * FROM workflows")
    suspend fun getAll(): List<WorkflowEntity>

    @androidx.room.Query("SELECT * FROM workflows WHERE id = :id")
    suspend fun getById(id: String): WorkflowEntity?

    @androidx.room.Insert(onConflict = androidx.room.OnConflictStrategy.REPLACE)
    suspend fun insert(workflow: WorkflowEntity)

    @androidx.room.Delete
    suspend fun delete(workflow: WorkflowEntity)

    @androidx.room.Query("DELETE FROM workflows")
    suspend fun deleteAll()
}

/**
 * Execution entity
 */
@androidx.room.Entity(tableName = "executions")
data class ExecutionEntity(
    @androidx.room.PrimaryKey
    val id: String,
    val workflowId: String,
    val status: String,
    val createdAt: Long,
    val updatedAt: Long
)

/**
 * Execution DAO
 */
@androidx.room.Dao
interface ExecutionDao {
    @androidx.room.Query("SELECT * FROM executions ORDER BY createdAt DESC")
    suspend fun getAll(): List<ExecutionEntity>

    @androidx.room.Query("SELECT * FROM executions WHERE id = :id")
    suspend fun getById(id: String): ExecutionEntity?

    @androidx.room.Insert(onConflict = androidx.room.OnConflictStrategy.REPLACE)
    suspend fun insert(execution: ExecutionEntity)

    @androidx.room.Delete
    suspend fun delete(execution: ExecutionEntity)

    @androidx.room.Query("DELETE FROM executions")
    suspend fun deleteAll()
}

/**
 * Offline manager
 */
class OfflineManager(
    private val context: Context,
    private val maxQueueSize: Int,
    private val retryAttempts: Int
) {
    private val database = AppDatabase.getInstance(context)
    private val queue = mutableListOf<OfflineAction>()

    /**
     * Enqueue action for offline processing
     */
    fun enqueue(action: OfflineAction) {
        if (queue.size >= maxQueueSize) {
            queue.removeAt(0)
        }
        queue.add(action)
    }

    /**
     * Process queued actions
     */
    suspend fun processQueue() {
        val actionsToProcess = queue.toList()
        queue.clear()

        for (action in actionsToProcess) {
            try {
                // Process action
                // If successful, mark as completed
                action.status = ActionStatus.COMPLETED
            } catch (e: Exception) {
                action.retryCount++
                if (action.retryCount < retryAttempts) {
                    // Re-queue
                    queue.add(action)
                } else {
                    action.status = ActionStatus.FAILED
                }
            }
        }
    }
}

/**
 * Sync manager
 */
class SyncManager(
    private val networkClient: NetworkClient,
    private val storageManager: StorageManager,
    private val syncInterval: Long
) {
    private var syncJob: kotlinx.coroutines.Job? = null

    /**
     * Start background sync
     */
    fun startSync() {
        syncJob?.cancel()
        syncJob = kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            while (kotlinx.coroutines.isActive) {
                sync()
                kotlinx.coroutines.delay(syncInterval)
            }
        }
    }

    /**
     * Stop background sync
     */
    fun stopSync() {
        syncJob?.cancel()
        syncJob = null
    }

    /**
     * Perform sync
     */
    suspend fun sync(): Result<SyncResult> {
        return try {
            // Sync logic here
            Result.success(
                SyncResult(
                    syncedItems = 0,
                    conflicts = 0,
                    timestamp = System.currentTimeMillis()
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
`;

	return {
		path: `src/main/java/${packagePath.replace(/\./g, '/')}/storage/StorageManager.kt`,
		content,
		language: 'kotlin',
		type: 'source',
	};
}
