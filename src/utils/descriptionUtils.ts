/**
 * Truncate description to 300 characters with "...more" indicator
 */
export const truncateDescription = (
  text: string | undefined,
  maxLength: number = 300
): { truncated: string; isTruncated: boolean } => {
  if (!text) {
    return { truncated: '', isTruncated: false };
  }

  if (text.length <= maxLength) {
    return { truncated: text, isTruncated: false };
  }

  // Find the last space before maxLength to avoid cutting words
  let endIndex = maxLength;
  const lastSpaceIndex = text.lastIndexOf(' ', maxLength);
  
  if (lastSpaceIndex > maxLength * 0.8) {
    // If last space is reasonably close, use it
    endIndex = lastSpaceIndex;
  }

  return {
    truncated: text.substring(0, endIndex).trim() + '...',
    isTruncated: true,
  };
};
