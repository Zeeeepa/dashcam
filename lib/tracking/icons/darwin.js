import { logger } from "../../logger.js";

const getIconAsBuffer = async (bundleId) => {
  try {
    // Import the file-icon package for macOS icon extraction
    const { fileIconToBuffer } = await import("file-icon");

    logger.debug("Extracting icon for macOS app", { bundleId });
    
    const buffer = await fileIconToBuffer(bundleId);
    if (!buffer) {
      logger.debug("No icon buffer returned for bundle", { bundleId });
      return null;
    }
    
    logger.debug("Successfully extracted macOS icon", { 
      bundleId, 
      bufferSize: buffer.length 
    });
    
    return { extension: "png", buffer };
  } catch (error) {
    logger.warn("Failed to extract macOS icon", { 
      bundleId, 
      error: error.message 
    });
    return null;
  }
};

export { getIconAsBuffer };
