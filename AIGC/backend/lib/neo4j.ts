// Neo4j Database Connection and Schema Management

import neo4j, { Driver, Session } from "neo4j-driver";

// ============================================================================
// Database Connection
// ============================================================================

let driver: Driver | null = null;

/**
 * Initialize Neo4j driver connection
 */
export function initDriver(): Driver {
  const uri = Deno.env.get("NEO4J_URI") || "bolt://localhost:7687";
  const username = Deno.env.get("NEO4J_USERNAME") || "neo4j";
  const password = Deno.env.get("NEO4J_PASSWORD") || "coldstart-password";

  if (!driver) {
    driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
    console.log("✅ Neo4j driver initialized");
  }

  return driver;
}

/**
 * Get Neo4j driver instance
 */
export function getDriver(): Driver {
  if (!driver) {
    return initDriver();
  }
  return driver;
}

/**
 * Get a new database session
 */
export function getSession(): Session {
  return getDriver().session();
}

/**
 * Close driver connection
 */
export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
    console.log("✅ Neo4j driver closed");
  }
}

// ============================================================================
// Database Schema Initialization
// ============================================================================

/**
 * Initialize database schema with constraints and indexes
 */
export async function initSchema(): Promise<void> {
  const session = getSession();

  try {
    console.log("🔧 Initializing Neo4j schema...");

    // ========================================================================
    // Constraints (Unique IDs)
    // ========================================================================

    // User constraints
    await session.run(`
      CREATE CONSTRAINT user_id_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.id IS UNIQUE
    `);

    // VideoProject constraints
    await session.run(`
      CREATE CONSTRAINT video_project_id_unique IF NOT EXISTS
      FOR (v:VideoProject) REQUIRE v.id IS UNIQUE
    `);

    // Script constraints
    await session.run(`
      CREATE CONSTRAINT script_id_unique IF NOT EXISTS
      FOR (s:Script) REQUIRE s.id IS UNIQUE
    `);

    // SceneScript constraints
    await session.run(`
      CREATE CONSTRAINT scene_script_id_unique IF NOT EXISTS
      FOR (ss:SceneScript) REQUIRE ss.id IS UNIQUE
    `);

    // Storyboard constraints
    await session.run(`
      CREATE CONSTRAINT storyboard_id_unique IF NOT EXISTS
      FOR (sb:Storyboard) REQUIRE sb.id IS UNIQUE
    `);

    // StoryboardScene constraints
    await session.run(`
      CREATE CONSTRAINT storyboard_scene_id_unique IF NOT EXISTS
      FOR (sbs:StoryboardScene) REQUIRE sbs.id IS UNIQUE
    `);

    // Asset constraints
    await session.run(`
      CREATE CONSTRAINT asset_id_unique IF NOT EXISTS
      FOR (a:Asset) REQUIRE a.id IS UNIQUE
    `);

    // Video constraints
    await session.run(`
      CREATE CONSTRAINT video_id_unique IF NOT EXISTS
      FOR (v:Video) REQUIRE v.id IS UNIQUE
    `);

    // StoryAnalysis constraints
    await session.run(`
      CREATE CONSTRAINT story_analysis_id_unique IF NOT EXISTS
      FOR (sa:StoryAnalysis) REQUIRE sa.id IS UNIQUE
    `);

    // ========================================================================
    // Indexes (Performance optimization)
    // ========================================================================

    // User indexes
    await session.run(`
      CREATE INDEX user_email_index IF NOT EXISTS
      FOR (u:User) ON (u.email)
    `);

    // VideoProject indexes
    await session.run(`
      CREATE INDEX video_project_user_id_index IF NOT EXISTS
      FOR (v:VideoProject) ON (v.userId)
    `);

    await session.run(`
      CREATE INDEX video_project_status_index IF NOT EXISTS
      FOR (v:VideoProject) ON (v.status)
    `);

    await session.run(`
      CREATE INDEX video_project_language_index IF NOT EXISTS
      FOR (v:VideoProject) ON (v.language)
    `);

    // Asset indexes
    await session.run(`
      CREATE INDEX asset_type_index IF NOT EXISTS
      FOR (a:Asset) ON (a.type)
    `);

    await session.run(`
      CREATE INDEX asset_tags_index IF NOT EXISTS
      FOR (a:Asset) ON (a.tags)
    `);

    // Vector index for asset similarity search (Neo4j 5.11+)
    try {
      await session.run(`
        CREATE VECTOR INDEX asset_embedding_index IF NOT EXISTS
        FOR (a:Asset) ON (a.embedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: 1536,
          \`vector.similarity_function\`: 'cosine'
        }}
      `);
    } catch (error) {
      console.warn(
        "⚠️  Vector index creation failed (requires Neo4j 5.11+):",
        error,
      );
    }

    console.log("✅ Neo4j schema initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing schema:", error);
    throw error;
  } finally {
    await session.close();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if database connection is healthy
 */
export async function checkConnection(): Promise<boolean> {
  const session = getSession();

  try {
    await session.run("RETURN 1");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  } finally {
    await session.close();
  }
}

/**
 * Clear all data from database (USE WITH CAUTION - for testing only)
 */
export async function clearDatabase(): Promise<void> {
  const session = getSession();

  try {
    console.log("🗑️  Clearing database...");

    // Delete all nodes and relationships
    await session.run("MATCH (n) DETACH DELETE n");

    console.log("✅ Database cleared");
  } catch (error) {
    console.error("❌ Error clearing database:", error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  nodeCount: number;
  relationshipCount: number;
  labels: string[];
}> {
  const session = getSession();

  try {
    // Get node count
    const nodeCountResult = await session.run(
      "MATCH (n) RETURN count(n) as count",
    );
    const nodeCount = nodeCountResult.records[0].get("count").toNumber();

    // Get relationship count
    const relCountResult = await session.run(
      "MATCH ()-[r]->() RETURN count(r) as count",
    );
    const relationshipCount = relCountResult.records[0].get("count").toNumber();

    // Get all labels
    const labelsResult = await session.run("CALL db.labels()");
    const labels = labelsResult.records.map((record: any) => record.get("label"));

    return {
      nodeCount,
      relationshipCount,
      labels,
    };
  } catch (error) {
    console.error("❌ Error getting database stats:", error);
    throw error;
  } finally {
    await session.close();
  }
}

// ============================================================================
// Export all functions
// ============================================================================

export default {
  initDriver,
  getDriver,
  getSession,
  closeDriver,
  initSchema,
  checkConnection,
  clearDatabase,
  getDatabaseStats,
};
