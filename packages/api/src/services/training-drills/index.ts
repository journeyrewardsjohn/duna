/**
 * Service seam: training-drills (owner: B5; scenes B6a). The drill library,
 * versions, scope, review, listings, the store (kill switch
 * training.storefront) and purchases, called from
 * ../../routers/training-drills.ts. Scenes are validated by the pure
 * `@duna/core/training-scene`. See docs/product/training.md.
 */
export {
  type DrillViewer,
  pinDrillVersions,
  purchasedCondition,
  visibleDrillCondition,
} from "./access";
export {
  copyLegacyScene,
  delist,
  drillDetail,
  LEGACY_SCENE_CONVERTED,
  library,
  marketplaceFeeBps,
  personalDataFindings,
  playerDrill,
  publicListing,
  purchase,
  purchases,
  saveListing,
  saveVersion,
  setScope,
  store,
  submitForReview,
} from "./drills-service";
