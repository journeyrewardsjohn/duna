import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  auditLog,
  getDatabase,
  people,
  videos,
  visionBenchmarkRuns,
  visionCalibrationSamples,
  visionModelApprovals,
  visionModels,
  visionTrainingRuns,
} from "@duna/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { ApiActor } from "./context";
import type {
  AdminVisionOverview,
  VisionBenchmarkRunSummary,
  VisionModelSummary,
  VisionTrainingRunSummary,
} from "./contracts";
import {
  visionBenchmarkCommandSchema,
  visionOperationResultSchema,
  visionTrainingCommandSchema,
  videoAnalysisQualityGateSchema,
} from "./contracts";
import { readPrivateR2JsonObject } from "./video-providers";

export class VisionModelError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "MODEL_NOT_FOUND"
      | "MODEL_ALREADY_EXISTS"
      | "MODEL_NOT_BENCHMARKED"
      | "MODEL_STAGE_INVALID"
      | "INDEPENDENT_APPROVER_REQUIRED"
      | "OPERATIONS_UNAVAILABLE"
      | "ATTESTATION_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "VisionModelError";
  }
}

async function verifyPromotionAttestation(input: {
  readonly objectKey: string;
  readonly modelVersion: string;
  readonly modelBundleSha256: string;
  readonly benchmarkId: string;
  readonly reportedQualityGate: unknown;
}) {
  const publicKeyPem =
    process.env.DUNA_VISION_ATTESTATION_PUBLIC_KEY_PEM?.trim();
  const expectedKey = `vision-models/${input.modelVersion}/${input.modelBundleSha256}.${input.benchmarkId}.attestation.json`;
  if (!publicKeyPem || input.objectKey !== expectedKey) {
    throw new VisionModelError(
      "ATTESTATION_INVALID",
      "The benchmark attestation is not bound to the exact model and benchmark.",
    );
  }
  try {
    const document = (await readPrivateR2JsonObject(input.objectKey)) as {
      schemaVersion?: unknown;
      payloadBase64?: unknown;
      signature?: unknown;
    };
    if (
      document.schemaVersion !== "duna-vision-promotion-attestation-v2" ||
      typeof document.payloadBase64 !== "string" ||
      typeof document.signature !== "string" ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(document.payloadBase64) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(document.signature)
    ) {
      throw new Error("Malformed attestation envelope");
    }
    const payload = Buffer.from(document.payloadBase64, "base64");
    const signature = Buffer.from(document.signature, "base64");
    const publicKey = createPublicKey(publicKeyPem);
    if (
      publicKey.asymmetricKeyType !== "ed25519" ||
      !verifySignature(null, payload, publicKey, signature)
    ) {
      throw new Error("Invalid attestation signature");
    }
    const gate = videoAnalysisQualityGateSchema.parse(
      JSON.parse(payload.toString("utf-8")),
    );
    if (
      gate.decision !== "passed" ||
      !gate.productionEligible ||
      gate.modelBundleSha256 !== input.modelBundleSha256 ||
      !isDeepStrictEqual(gate, input.reportedQualityGate)
    ) {
      throw new Error("Attestation evidence mismatch");
    }
    return gate;
  } catch (error) {
    if (error instanceof VisionModelError) throw error;
    throw new VisionModelError(
      "ATTESTATION_INVALID",
      "The signed benchmark evidence could not be verified.",
    );
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new VisionModelError(
      "DATABASE_REQUIRED",
      "Duna Vision model operations require the connected database.",
    );
  }
}

function iso(value: Date | null): string | undefined {
  return value?.toISOString();
}

function operationsConfiguration():
  { readonly url: string; readonly token: string } | undefined {
  const candidate = process.env.DUNA_VISION_OPERATIONS_URL?.trim();
  const token = process.env.DUNA_ANALYSIS_WORKER_TOKEN?.trim();
  if (!candidate || !token) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:"
      ? { url: url.toString(), token }
      : undefined;
  } catch {
    return undefined;
  }
}

async function dispatchOperation(command: unknown): Promise<string> {
  const worker = operationsConfiguration();
  if (!worker) {
    throw new VisionModelError(
      "OPERATIONS_UNAVAILABLE",
      "The Modal training and benchmark endpoint is not configured.",
    );
  }
  const response = await fetch(worker.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${worker.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new VisionModelError(
      "OPERATIONS_UNAVAILABLE",
      "Modal did not accept the Duna Vision operation.",
    );
  }
  const payload = (await response.json()) as { providerJobId?: string };
  return payload.providerJobId ?? "modal-accepted";
}

async function audit(input: {
  readonly actorPersonId?: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<void> {
  await getDatabase()
    .insert(auditLog)
    .values({
      actorPersonId: input.actorPersonId,
      actorType: input.actorPersonId ? "person" : "system",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
}

export async function loadAdminVisionOverview(
  actor: ApiActor,
): Promise<AdminVisionOverview> {
  const canManage = actor.roles.includes("super-admin");
  if (!process.env.DATABASE_URL) {
    return {
      canManage,
      runtime: { configured: false, provider: "modal", gpuType: "L4" },
      eligibility: {
        approvedCalibrationSamples: 0,
        consentedVideos: 0,
        pendingCalibrationReviews: 0,
      },
      models: [],
      trainingRuns: [],
      benchmarkRuns: [],
    };
  }
  const database = getDatabase();
  const [modelRows, approvalRows, trainingRows, benchmarkRows, eligibility] =
    await Promise.all([
      database
        .select({ model: visionModels, createdByName: people.displayName })
        .from(visionModels)
        .leftJoin(people, eq(visionModels.createdByPersonId, people.id))
        .orderBy(desc(visionModels.updatedAt)),
      database
        .select({
          approval: visionModelApprovals,
          reviewerName: people.displayName,
        })
        .from(visionModelApprovals)
        .innerJoin(people, eq(visionModelApprovals.reviewerPersonId, people.id))
        .orderBy(desc(visionModelApprovals.createdAt)),
      database
        .select({
          run: visionTrainingRuns,
          requestedByName: people.displayName,
        })
        .from(visionTrainingRuns)
        .leftJoin(people, eq(visionTrainingRuns.requestedByPersonId, people.id))
        .orderBy(desc(visionTrainingRuns.createdAt))
        .limit(30),
      database
        .select({
          run: visionBenchmarkRuns,
          modelVersion: visionModels.version,
          requestedByName: people.displayName,
        })
        .from(visionBenchmarkRuns)
        .innerJoin(
          visionModels,
          eq(visionBenchmarkRuns.modelId, visionModels.id),
        )
        .leftJoin(
          people,
          eq(visionBenchmarkRuns.requestedByPersonId, people.id),
        )
        .orderBy(desc(visionBenchmarkRuns.createdAt))
        .limit(30),
      Promise.all([
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(visionCalibrationSamples)
          .where(eq(visionCalibrationSamples.status, "approved")),
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(videos)
          .where(eq(videos.visionLearningConsent, true)),
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(visionCalibrationSamples)
          .where(eq(visionCalibrationSamples.status, "pending")),
      ]),
    ]);
  const approvalsByModel = new Map<string, VisionModelSummary["approvals"]>();
  for (const row of approvalRows) {
    const values = approvalsByModel.get(row.approval.modelId) ?? [];
    approvalsByModel.set(row.approval.modelId, [
      ...values,
      {
        id: row.approval.id,
        stage: row.approval.stage as
          "dataset" | "shadow" | "production" | "rollback",
        decision: row.approval.decision as "approved" | "rejected",
        reviewerName: row.reviewerName,
        notes: row.approval.notes,
        evidenceSha256: row.approval.evidenceSha256,
        createdAt: row.approval.createdAt.toISOString(),
      },
    ]);
  }
  const models: VisionModelSummary[] = modelRows.map(
    ({ model, createdByName }) => ({
      id: model.id,
      version: model.version,
      bundleSha256: model.bundleSha256,
      bundleR2Prefix: model.bundleR2Prefix,
      detectorFamily: model.detectorFamily,
      sourceLicense: model.sourceLicense,
      status: model.status as VisionModelSummary["status"],
      manifest: model.manifest,
      qualityGate: model.qualityGate as VisionModelSummary["qualityGate"],
      promotionAttestationAvailable: Boolean(model.promotionAttestationR2Key),
      createdByName: createdByName ?? undefined,
      shadowApprovedAt: iso(model.shadowApprovedAt),
      productionApprovedAt: iso(model.productionApprovedAt),
      retiredAt: iso(model.retiredAt),
      createdAt: model.createdAt.toISOString(),
      updatedAt: model.updatedAt.toISOString(),
      approvals: approvalsByModel.get(model.id) ?? [],
    }),
  );
  const trainingRuns: VisionTrainingRunSummary[] = trainingRows.map(
    ({ run, requestedByName }) => ({
      id: run.id,
      requestedModelVersion: run.requestedModelVersion,
      modelId: run.modelId ?? undefined,
      status: run.status as VisionTrainingRunSummary["status"],
      provider: "modal",
      gpuType: "L4",
      datasetR2Key: run.datasetR2Key,
      datasetManifestSha256: run.datasetManifestSha256 ?? undefined,
      baseModelVersion: run.baseModelVersion ?? undefined,
      codeCommitSha: run.codeCommitSha,
      budgetCents: run.budgetCents,
      actualCostCents: run.actualCostCents ?? undefined,
      providerJobId: run.providerJobId ?? undefined,
      metrics: run.metrics ?? undefined,
      failureCode: run.failureCode ?? undefined,
      requestedByName: requestedByName ?? undefined,
      startedAt: iso(run.startedAt),
      completedAt: iso(run.completedAt),
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    }),
  );
  const benchmarkRuns: VisionBenchmarkRunSummary[] = benchmarkRows.map(
    ({ run, modelVersion, requestedByName }) => ({
      id: run.id,
      modelId: run.modelId,
      modelVersion,
      benchmarkId: run.benchmarkId,
      status: run.status as VisionBenchmarkRunSummary["status"],
      datasetManifestR2Key: run.datasetManifestR2Key,
      datasetManifestSha256: run.datasetManifestSha256 ?? undefined,
      attestationAvailable: Boolean(run.attestationR2Key),
      qualityGate: run.qualityGate as VisionBenchmarkRunSummary["qualityGate"],
      failureCode: run.failureCode ?? undefined,
      requestedByName: requestedByName ?? undefined,
      startedAt: iso(run.startedAt),
      completedAt: iso(run.completedAt),
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    }),
  );
  return {
    canManage,
    runtime: {
      configured: Boolean(operationsConfiguration()),
      provider: "modal",
      gpuType: "L4",
      productionModelVersion: models.find(
        (model) => model.status === "production",
      )?.version,
    },
    eligibility: {
      approvedCalibrationSamples: eligibility[0][0]?.count ?? 0,
      consentedVideos: eligibility[1][0]?.count ?? 0,
      pendingCalibrationReviews: eligibility[2][0]?.count ?? 0,
    },
    models,
    trainingRuns,
    benchmarkRuns,
  };
}

export async function registerVisionModel(input: {
  readonly actor: ApiActor;
  readonly version: string;
  readonly bundleSha256: string;
  readonly bundleR2Prefix: string;
  readonly detectorFamily: string;
  readonly sourceLicense: string;
  readonly manifest: Record<string, unknown>;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly version: string }> {
  requireDatabase();
  const database = getDatabase();
  const existing = await database.query.visionModels.findFirst({
    where: inArray(visionModels.bundleSha256, [input.bundleSha256]),
  });
  if (existing) {
    throw new VisionModelError(
      "MODEL_ALREADY_EXISTS",
      "That exact model bundle is already registered.",
    );
  }
  const [model] = await database
    .insert(visionModels)
    .values({
      version: input.version,
      bundleSha256: input.bundleSha256,
      bundleR2Prefix: input.bundleR2Prefix,
      detectorFamily: input.detectorFamily,
      sourceLicense: input.sourceLicense,
      manifest: input.manifest,
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: visionModels.id, version: visionModels.version });
  await audit({
    actorPersonId: input.actor.personId,
    action: "vision.model-registered",
    entityType: "vision-model",
    entityId: model!.id,
    reason: input.reason,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return model!;
}

export async function requestVisionTraining(input: {
  readonly actor: ApiActor;
  readonly requestedModelVersion: string;
  readonly datasetR2Key: string;
  readonly baseModelVersion?: string;
  readonly codeCommitSha: string;
  readonly budgetCents: number;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "queued" | "running" }> {
  requireDatabase();
  const database = getDatabase();
  const baseModel = input.baseModelVersion
    ? await database.query.visionModels.findFirst({
        where: eq(visionModels.version, input.baseModelVersion),
      })
    : undefined;
  if (input.baseModelVersion && !baseModel) {
    throw new VisionModelError(
      "MODEL_NOT_FOUND",
      "The requested base model version is not registered.",
    );
  }
  const [run] = await database
    .insert(visionTrainingRuns)
    .values({
      requestedModelVersion: input.requestedModelVersion,
      datasetR2Key: input.datasetR2Key,
      baseModelVersion: input.baseModelVersion,
      codeCommitSha: input.codeCommitSha,
      budgetCents: input.budgetCents,
      requestedByPersonId: input.actor.personId,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: visionTrainingRuns.id });
  const command = visionTrainingCommandSchema.parse({
    kind: "training",
    runId: run!.id,
    requestedModelVersion: input.requestedModelVersion,
    datasetR2Key: input.datasetR2Key,
    baseModelVersion: input.baseModelVersion,
    baseModelBundleR2Prefix: baseModel?.bundleR2Prefix,
    codeCommitSha: input.codeCommitSha,
    budgetCents: input.budgetCents,
    callbackPath: "/api/vision/operations",
  });
  try {
    const providerJobId = await dispatchOperation(command);
    await database
      .update(visionTrainingRuns)
      .set({
        status: "running",
        providerJobId,
        startedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(visionTrainingRuns.id, run!.id));
  } catch (error) {
    await database
      .update(visionTrainingRuns)
      .set({
        status: "failed",
        failureCode: "MODAL_DISPATCH_FAILED",
        completedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(visionTrainingRuns.id, run!.id));
    throw error;
  }
  await audit({
    actorPersonId: input.actor.personId,
    action: "vision.training-requested",
    entityType: "vision-training-run",
    entityId: run!.id,
    reason: input.reason,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return { id: run!.id, status: "running" };
}

export async function requestVisionBenchmark(input: {
  readonly actor: ApiActor;
  readonly modelId: string;
  readonly benchmarkId: string;
  readonly datasetManifestR2Key: string;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "running" }> {
  requireDatabase();
  const database = getDatabase();
  const model = await database.query.visionModels.findFirst({
    where: eq(visionModels.id, input.modelId),
  });
  if (!model) throw new VisionModelError("MODEL_NOT_FOUND", "Model not found.");
  if (model.status === "rejected") {
    throw new VisionModelError(
      "MODEL_STAGE_INVALID",
      "A rejected model is terminal and must be registered as a new immutable version.",
    );
  }
  const [run] = await database
    .insert(visionBenchmarkRuns)
    .values({
      modelId: model.id,
      benchmarkId: input.benchmarkId,
      datasetManifestR2Key: input.datasetManifestR2Key,
      requestedByPersonId: input.actor.personId,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: visionBenchmarkRuns.id });
  const command = visionBenchmarkCommandSchema.parse({
    kind: "benchmark",
    runId: run!.id,
    modelId: model.id,
    modelVersion: model.version,
    modelBundleR2Prefix: model.bundleR2Prefix,
    benchmarkId: input.benchmarkId,
    datasetManifestR2Key: input.datasetManifestR2Key,
    callbackPath: "/api/vision/operations",
  });
  const providerJobId = await dispatchOperation(command);
  await database
    .update(visionBenchmarkRuns)
    .set({
      status: "running",
      providerJobId,
      startedAt: input.now,
      updatedAt: input.now,
    })
    .where(eq(visionBenchmarkRuns.id, run!.id));
  await audit({
    actorPersonId: input.actor.personId,
    action: "vision.benchmark-requested",
    entityType: "vision-benchmark-run",
    entityId: run!.id,
    reason: input.reason,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return { id: run!.id, status: "running" };
}

export async function reviewVisionModel(input: {
  readonly actor: ApiActor;
  readonly modelId: string;
  readonly stage: "shadow" | "production" | "rollback";
  readonly decision: "approved" | "rejected";
  readonly notes: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly modelId: string;
  readonly status: string;
  readonly approvalsNeeded: number;
}> {
  requireDatabase();
  const database = getDatabase();
  const model = await database.query.visionModels.findFirst({
    where: eq(visionModels.id, input.modelId),
  });
  if (!model) throw new VisionModelError("MODEL_NOT_FOUND", "Model not found.");
  if (model.status === "rejected") {
    throw new VisionModelError(
      "MODEL_STAGE_INVALID",
      "A rejected model is terminal and must be registered as a new immutable version.",
    );
  }
  if (
    ["production", "rollback"].includes(input.stage) &&
    (!model.qualityGate ||
      model.qualityGate.productionEligible !== true ||
      model.qualityGate.decision !== "passed" ||
      !model.promotionAttestationR2Key)
  ) {
    throw new VisionModelError(
      "MODEL_NOT_BENCHMARKED",
      "Production approval is locked until the exact model has a passing signed benchmark.",
    );
  }
  if (input.stage === "production" && model.status !== "shadow") {
    throw new VisionModelError(
      "MODEL_STAGE_INVALID",
      "A model must complete shadow review before production approval.",
    );
  }
  if (input.stage === "shadow" && model.status !== "candidate") {
    throw new VisionModelError(
      "MODEL_STAGE_INVALID",
      "Only a candidate model can enter shadow evaluation.",
    );
  }
  if (input.stage === "rollback" && model.status !== "retired") {
    throw new VisionModelError(
      "MODEL_STAGE_INVALID",
      "Only a previously validated retired model can be selected for rollback.",
    );
  }
  const evidenceSha256 = createHash("sha256")
    .update(
      JSON.stringify({
        bundleSha256: model.bundleSha256,
        qualityGate: model.qualityGate,
        stage: input.stage,
        decision: input.decision,
      }),
    )
    .digest("hex");
  await database.insert(visionModelApprovals).values({
    modelId: model.id,
    stage: input.stage,
    decision: input.decision,
    reviewerPersonId: input.actor.personId,
    notes: input.notes,
    evidenceSha256,
    createdAt: input.now,
  });
  let nextStatus = model.status;
  let approvalsNeeded = 0;
  if (input.decision === "rejected") {
    nextStatus = "rejected";
  } else if (input.stage === "shadow") {
    nextStatus = "shadow";
  } else if (["production", "rollback"].includes(input.stage)) {
    const approvals = await database
      .select({ reviewerPersonId: visionModelApprovals.reviewerPersonId })
      .from(visionModelApprovals)
      .where(
        and(
          eq(visionModelApprovals.modelId, model.id),
          eq(visionModelApprovals.stage, input.stage),
          eq(visionModelApprovals.decision, "approved"),
        ),
      );
    const independent = new Set(
      approvals.map((approval) => approval.reviewerPersonId),
    );
    approvalsNeeded = Math.max(0, 2 - independent.size);
    if (approvalsNeeded === 0) {
      await database
        .update(visionModels)
        .set({ status: "retired", retiredAt: input.now, updatedAt: input.now })
        .where(eq(visionModels.status, "production"));
      nextStatus = "production";
    }
  }
  await database
    .update(visionModels)
    .set({
      status: nextStatus,
      shadowApprovedAt:
        nextStatus === "shadow" ? input.now : model.shadowApprovedAt,
      productionApprovedAt:
        nextStatus === "production" ? input.now : model.productionApprovedAt,
      retiredAt: nextStatus === "retired" ? input.now : model.retiredAt,
      updatedAt: input.now,
    })
    .where(eq(visionModels.id, model.id));
  await audit({
    actorPersonId: input.actor.personId,
    action: `vision.model-${input.stage}-${input.decision}`,
    entityType: "vision-model",
    entityId: model.id,
    reason: input.notes,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return { modelId: model.id, status: nextStatus, approvalsNeeded };
}

export async function ingestVisionOperationResult(input: {
  readonly result: unknown;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<void> {
  requireDatabase();
  const result = visionOperationResultSchema.parse(input.result);
  const database = getDatabase();
  if (result.kind === "training") {
    const run = await database.query.visionTrainingRuns.findFirst({
      where: eq(visionTrainingRuns.id, result.runId),
    });
    if (!run)
      throw new VisionModelError("MODEL_NOT_FOUND", "Training run not found.");
    let modelId = run.modelId;
    if (result.status === "succeeded" && result.model) {
      const [model] = await database
        .insert(visionModels)
        .values({
          version: result.model.version,
          bundleSha256: result.model.bundleSha256,
          bundleR2Prefix: result.model.bundleR2Prefix,
          detectorFamily: result.model.detectorFamily,
          sourceLicense: result.model.sourceLicense,
          manifest: result.model.manifest,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({ target: visionModels.bundleSha256 })
        .returning({ id: visionModels.id });
      modelId =
        model?.id ??
        (
          await database.query.visionModels.findFirst({
            where: eq(visionModels.bundleSha256, result.model.bundleSha256),
          })
        )?.id ??
        null;
    }
    await database
      .update(visionTrainingRuns)
      .set({
        status: result.status === "succeeded" ? "succeeded" : result.status,
        modelId,
        providerJobId: result.providerJobId ?? run.providerJobId,
        actualCostCents: result.actualCostCents,
        metrics: result.model?.metrics,
        failureCode: result.failureCode,
        startedAt:
          result.status === "running"
            ? (run.startedAt ?? input.now)
            : run.startedAt,
        completedAt: ["succeeded", "failed"].includes(result.status)
          ? input.now
          : undefined,
        updatedAt: input.now,
      })
      .where(eq(visionTrainingRuns.id, run.id));
  } else {
    const run = await database.query.visionBenchmarkRuns.findFirst({
      where: eq(visionBenchmarkRuns.id, result.runId),
    });
    if (!run)
      throw new VisionModelError("MODEL_NOT_FOUND", "Benchmark run not found.");
    const model = await database.query.visionModels.findFirst({
      where: eq(visionModels.id, run.modelId),
    });
    if (!model)
      throw new VisionModelError("MODEL_NOT_FOUND", "Model not found.");
    const verifiedGate =
      result.status === "passed" &&
      result.qualityGate &&
      result.attestationR2Key
        ? await verifyPromotionAttestation({
            objectKey: result.attestationR2Key,
            modelVersion: model.version,
            modelBundleSha256: model.bundleSha256,
            benchmarkId: run.benchmarkId,
            reportedQualityGate: result.qualityGate,
          })
        : undefined;
    await database
      .update(visionBenchmarkRuns)
      .set({
        status: result.status,
        providerJobId: result.providerJobId ?? run.providerJobId,
        datasetManifestSha256:
          verifiedGate?.datasetManifestSha256 ?? run.datasetManifestSha256,
        qualityGate: verifiedGate ?? result.qualityGate,
        attestationR2Key: verifiedGate ? result.attestationR2Key : undefined,
        failureCode: result.failureCode,
        completedAt: ["passed", "failed"].includes(result.status)
          ? input.now
          : undefined,
        updatedAt: input.now,
      })
      .where(eq(visionBenchmarkRuns.id, run.id));
    if (result.status === "passed" && verifiedGate && result.attestationR2Key) {
      await database
        .update(visionModels)
        .set({
          qualityGate: verifiedGate,
          promotionAttestationR2Key: result.attestationR2Key,
          updatedAt: input.now,
        })
        .where(eq(visionModels.id, run.modelId));
    }
  }
  await audit({
    action: `vision.${result.kind}-${result.status}`,
    entityType: `vision-${result.kind}-run`,
    entityId: result.runId,
    reason: `Modal reported ${result.status} with bounded provenance.`,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
}
