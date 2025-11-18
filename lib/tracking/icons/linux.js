import { logger } from "../../logger.js";
import { execa } from "execa";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Find icon for a Linux application using various strategies
 */
const findLinuxIcon = async (appName) => {
  // Strategy 1: Look for .desktop file
  const desktopFile = await findDesktopFile(appName);
  if (desktopFile) {
    const iconName = await extractIconFromDesktop(desktopFile);
    if (iconName) {
      const iconPath = await findIconInTheme(iconName);
      if (iconPath) {
        logger.debug("Found icon via .desktop file", { appName, iconPath });
        return iconPath;
      }
    }
  }

  // Strategy 2: Try to find icon directly in icon themes
  const iconPath = await findIconInTheme(appName);
  if (iconPath) {
    logger.debug("Found icon in theme", { appName, iconPath });
    return iconPath;
  }

  // Strategy 3: Common application paths
  const commonPaths = [
    `/usr/share/pixmaps/${appName}.png`,
    `/usr/share/pixmaps/${appName}.svg`,
    `/usr/share/icons/hicolor/48x48/apps/${appName}.png`,
    `/usr/share/icons/hicolor/scalable/apps/${appName}.svg`,
  ];

  for (const iconPath of commonPaths) {
    if (fs.existsSync(iconPath)) {
      logger.debug("Found icon in common path", { appName, iconPath });
      return iconPath;
    }
  }

  logger.debug("No icon found for Linux app", { appName });
  return null;
};

/**
 * Calculate string similarity (Levenshtein distance based)
 * Returns a value between 0 (no match) and 1 (perfect match)
 */
const calculateSimilarity = (str1, str2) => {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Exact match
  if (s1 === s2) return 1.0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8;
  }
  
  // Simple Levenshtein-based similarity
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(s1, s2);
  return (longer.length - editDistance) / longer.length;
};

/**
 * Calculate Levenshtein distance between two strings
 */
const levenshteinDistance = (str1, str2) => {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
};

/**
 * Find .desktop file for an application
 */
const findDesktopFile = async (appName) => {
  const desktopDirs = [
    "/usr/share/applications",
    "/usr/local/share/applications",
    path.join(os.homedir(), ".local/share/applications"),
  ];

  // Try exact match first
  for (const dir of desktopDirs) {
    const desktopFile = path.join(dir, `${appName}.desktop`);
    if (fs.existsSync(desktopFile)) {
      logger.debug("Found desktop file (exact match)", { appName, desktopFile });
      return desktopFile;
    }
  }

  // Try case-insensitive exact match
  for (const dir of desktopDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      
      const files = fs.readdirSync(dir);
      const match = files.find(
        (f) => f.toLowerCase() === `${appName.toLowerCase()}.desktop`
      );
      if (match) {
        logger.debug("Found desktop file (case-insensitive)", { appName, match });
        return path.join(dir, match);
      }
    } catch (error) {
      logger.debug("Error reading desktop directory", { dir, error: error.message });
    }
  }

  // Try fuzzy matching - find best match based on string similarity
  let bestMatch = null;
  let bestScore = 0.6; // Minimum similarity threshold
  
  for (const dir of desktopDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop'));
      
      for (const file of files) {
        const baseName = file.replace('.desktop', '');
        const similarity = calculateSimilarity(appName, baseName);
        
        if (similarity > bestScore) {
          bestScore = similarity;
          bestMatch = path.join(dir, file);
        }
      }
    } catch (error) {
      logger.debug("Error in fuzzy desktop file search", { dir, error: error.message });
    }
  }
  
  if (bestMatch) {
    logger.debug("Found desktop file (fuzzy match)", { 
      appName, 
      desktopFile: bestMatch, 
      similarity: bestScore.toFixed(2) 
    });
    return bestMatch;
  }

  logger.debug("No desktop file found", { appName });
  return null;
};

/**
 * Extract icon name from .desktop file
 */
const extractIconFromDesktop = async (desktopFilePath) => {
  try {
    const content = fs.readFileSync(desktopFilePath, "utf8");
    const iconMatch = content.match(/^Icon=(.+)$/m);
    if (iconMatch) {
      return iconMatch[1].trim();
    }
  } catch (error) {
    logger.debug("Error reading desktop file", { 
      desktopFilePath, 
      error: error.message 
    });
  }
  return null;
};

/**
 * Find icon in XDG icon themes
 */
const findIconInTheme = async (iconName) => {
  // Common icon theme locations and sizes
  const iconThemes = ["hicolor", "gnome", "Adwaita", "breeze", "oxygen"];
  const iconSizes = ["48x48", "64x64", "scalable", "128x128", "256x256"];
  const iconFormats = ["png", "svg", "xpm"];

  const searchPaths = [
    "/usr/share/icons",
    "/usr/local/share/icons",
    path.join(os.homedir(), ".local/share/icons"),
    path.join(os.homedir(), ".icons"),
  ];

  for (const basePath of searchPaths) {
    if (!fs.existsSync(basePath)) continue;

    for (const theme of iconThemes) {
      const themePath = path.join(basePath, theme);
      if (!fs.existsSync(themePath)) continue;

      for (const size of iconSizes) {
        const sizePath = path.join(themePath, size, "apps");
        if (!fs.existsSync(sizePath)) continue;

        for (const format of iconFormats) {
          const iconPath = path.join(sizePath, `${iconName}.${format}`);
          if (fs.existsSync(iconPath)) {
            return iconPath;
          }
        }
      }
    }
  }

  return null;
};

/**
 * Convert image to PNG if needed
 */
const convertToPng = async (iconPath) => {
  const ext = path.extname(iconPath).toLowerCase();
  
  // If already PNG, read and return
  if (ext === ".png") {
    return fs.readFileSync(iconPath);
  }

  // For SVG, try to convert using ImageMagick or rsvg-convert
  if (ext === ".svg") {
    const tmpPngPath = path.join(os.tmpdir(), `icon-${Date.now()}.png`);
    
    try {
      // Try rsvg-convert first (commonly available on Linux)
      await execa("rsvg-convert", [
        "-w", "48",
        "-h", "48",
        "-o", tmpPngPath,
        iconPath
      ]);
      
      const buffer = fs.readFileSync(tmpPngPath);
      fs.unlinkSync(tmpPngPath);
      return buffer;
    } catch (error) {
      logger.debug("rsvg-convert failed, trying ImageMagick", { error: error.message });
      
      try {
        // Fallback to ImageMagick convert
        await execa("convert", [
          "-background", "none",
          "-resize", "48x48",
          iconPath,
          tmpPngPath
        ]);
        
        const buffer = fs.readFileSync(tmpPngPath);
        fs.unlinkSync(tmpPngPath);
        return buffer;
      } catch (convertError) {
        logger.debug("ImageMagick convert failed", { error: convertError.message });
        
        // Clean up temp file if it exists
        if (fs.existsSync(tmpPngPath)) {
          fs.unlinkSync(tmpPngPath);
        }
        
        return null;
      }
    }
  }

  // For XPM, try ImageMagick
  if (ext === ".xpm") {
    const tmpPngPath = path.join(os.tmpdir(), `icon-${Date.now()}.png`);
    
    try {
      await execa("convert", [
        "-background", "none",
        "-resize", "48x48",
        iconPath,
        tmpPngPath
      ]);
      
      const buffer = fs.readFileSync(tmpPngPath);
      fs.unlinkSync(tmpPngPath);
      return buffer;
    } catch (error) {
      logger.debug("Failed to convert XPM to PNG", { error: error.message });
      
      // Clean up temp file if it exists
      if (fs.existsSync(tmpPngPath)) {
        fs.unlinkSync(tmpPngPath);
      }
      
      return null;
    }
  }

  logger.debug("Unsupported icon format", { ext, iconPath });
  return null;
};

/**
 * Get icon as buffer for Linux application
 * @param {string} appPath - Path to the application or process name
 */
const getIconAsBuffer = async (appPath) => {
  try {
    // Extract app name from path
    let appName = path.basename(appPath);
    
    // Remove common extensions
    appName = appName.replace(/\.(exe|bin|sh|py|js)$/i, "");
    
    logger.debug("Extracting icon for Linux app", { appName, appPath });
    
    // Find the icon file
    const iconPath = await findLinuxIcon(appName);
    if (!iconPath) {
      logger.debug("No icon found for Linux app", { appName });
      return null;
    }
    
    // Convert to PNG if needed
    const buffer = await convertToPng(iconPath);
    if (!buffer) {
      logger.debug("Failed to convert icon to PNG", { iconPath });
      return null;
    }
    
    logger.debug("Successfully extracted Linux icon", {
      appName,
      iconPath,
      bufferSize: buffer.length,
    });
    
    return { extension: "png", buffer };
  } catch (error) {
    logger.warn("Failed to extract Linux icon", {
      appPath,
      error: error.message,
    });
    return null;
  }
};

export { getIconAsBuffer };
