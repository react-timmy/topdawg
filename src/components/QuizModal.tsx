/**
 * QuizModal.tsx
 *
 * Modal for verifying that a user has watched a movie/TV show via quiz questions.
 * Shows multiple choice questions generated from TMDB metadata.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { X, CheckCircle, XCircle, AlertCircle } from 'lucide-react-native';
import { QuizQuestion, MediaItem } from '../types';

interface QuizModalProps {
  visible: boolean;
  item: MediaItem | null;
  question: QuizQuestion | null;
  loading: boolean;
  onClose: () => void;
  onAnswer: (selectedIndex: number) => void;
  onSkip: () => void;
}

export function QuizModal({
  visible,
  item,
  question,
  loading,
  onClose,
  onAnswer,
  onSkip,
}: QuizModalProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleSelectOption = (index: number) => {
    if (showResult) return; // Prevent changing answer after submission

    setSelectedIndex(index);
    const correct = Boolean(question && index === question.correctIndex);
    setIsCorrect(correct);
    setShowResult(true);

    // Auto-close and proceed after showing result
    setTimeout(() => {
      onAnswer(index);
      resetState();
    }, 1500);
  };

  const handleSkip = () => {
    onSkip();
    resetState();
  };

  const handleClose = () => {
    onClose();
    resetState();
  };

  const resetState = () => {
    setSelectedIndex(null);
    setShowResult(false);
    setIsCorrect(false);
  };

  if (!visible || !item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <BlurView intensity={40} style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modal}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerContent}>
                <AlertCircle size={20} color="#f59e0b" strokeWidth={2} />
                <Text style={styles.headerTitle}>Verify You&apos;ve Watched This</Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={12}>
                <X size={22} color="#71717a" strokeWidth={2} />
              </Pressable>
            </View>

            {/* Media info */}
            <View style={styles.mediaInfo}>
              {item.posterUrl && (
                <Image source={{ uri: item.posterUrl }} style={styles.poster} />
              )}
              <View style={styles.mediaDetails}>
                <Text style={styles.mediaTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.mediaType}>
                  {item.type === 'movie' ? 'Movie' : 'TV Show'}
                  {item.releaseDate &&
                    ` • ${new Date(item.releaseDate).getFullYear()}`}
                </Text>
              </View>
            </View>

            {/* Loading state */}
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#a78bfa" />
                <Text style={styles.loadingText}>Generating question...</Text>
              </View>
            )}

            {/* Question and options */}
            {!loading && question && (
              <View style={styles.quizContainer}>
                <Text style={styles.question}>{question.question}</Text>

                <View style={styles.options}>
                  {question.options.map((option, index) => {
                    const isSelected = selectedIndex === index;
                    const isCorrectOption = showResult && index === question.correctIndex;
                    const isWrongSelection =
                      showResult && isSelected && !isCorrectOption;

                    return (
                      <Pressable
                        key={index}
                        style={({ pressed }) => [
                          styles.option,
                          isSelected && styles.optionSelected,
                          isCorrectOption && styles.optionCorrect,
                          isWrongSelection && styles.optionWrong,
                          pressed && !showResult && { opacity: 0.7 },
                        ]}
                        onPress={() => handleSelectOption(index)}
                        disabled={showResult}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            isSelected && styles.optionTextSelected,
                            isCorrectOption && styles.optionTextCorrect,
                            isWrongSelection && styles.optionTextWrong,
                          ]}
                        >
                          {option}
                        </Text>
                        {showResult && isCorrectOption && (
                          <CheckCircle size={20} color="#22c55e" strokeWidth={2} />
                        )}
                        {showResult && isWrongSelection && (
                          <XCircle size={20} color="#ef4444" strokeWidth={2} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Result message */}
                {showResult && (
                  <View
                    style={[
                      styles.resultMessage,
                      isCorrect
                        ? styles.resultMessageCorrect
                        : styles.resultMessageWrong,
                    ]}
                  >
                    <Text
                      style={[
                        styles.resultText,
                        isCorrect ? styles.resultTextCorrect : styles.resultTextWrong,
                      ]}
                    >
                      {isCorrect
                        ? '✓ Correct! Adding to collection...'
                        : '✗ Incorrect, but we&apos;ll add it anyway'}
                    </Text>
                  </View>
                )}

                {/* Skip button */}
                {!showResult && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.skipButton,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={handleSkip}
                  >
                    <Text style={styles.skipButtonText}>
                      Skip verification (I haven&apos;t watched it)
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Error state (no question could be generated) */}
            {!loading && !question && (
              <View style={styles.errorContainer}>
                <XCircle size={48} color="#ef4444" strokeWidth={2} />
                <Text style={styles.errorText}>
                Couldn&apos;t generate a verification question.
                </Text>
                <Text style={styles.errorHint}>
                We&apos;ll add it to your collection without verification.
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.errorButton,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => onAnswer(-1)} // -1 indicates skip/no-verification
                >
                  <Text style={styles.errorButtonText}>Continue</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 500,
  },
  modal: {
    backgroundColor: '#18181b',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  mediaInfo: {
    flexDirection: 'row',
    padding: 20,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#27272a',
  },
  mediaDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  mediaTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  mediaType: {
    fontSize: 13,
    color: '#71717a',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#a1a1aa',
  },
  quizContainer: {
    padding: 20,
  },
  question: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 20,
    lineHeight: 24,
  },
  options: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#09090b',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#27272a',
  },
  optionSelected: {
    borderColor: '#a78bfa',
    backgroundColor: '#1e1b4b',
  },
  optionCorrect: {
    borderColor: '#22c55e',
    backgroundColor: '#14532d',
  },
  optionWrong: {
    borderColor: '#ef4444',
    backgroundColor: '#450a0a',
  },
  optionText: {
    fontSize: 15,
    color: '#a1a1aa',
    flex: 1,
  },
  optionTextSelected: {
    color: '#ffffff',
    fontWeight: '500',
  },
  optionTextCorrect: {
    color: '#ffffff',
    fontWeight: '600',
  },
  optionTextWrong: {
    color: '#ffffff',
    fontWeight: '600',
  },
  resultMessage: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resultMessageCorrect: {
    backgroundColor: '#14532d',
  },
  resultMessageWrong: {
    backgroundColor: '#450a0a',
  },
  resultText: {
    fontSize: 14,
    fontWeight: '500',
  },
  resultTextCorrect: {
    color: '#22c55e',
  },
  resultTextWrong: {
    color: '#ef4444',
  },
  skipButton: {
    marginTop: 16,
    padding: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 13,
    color: '#71717a',
    textDecorationLine: 'underline',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
  },
  errorButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#a78bfa',
    borderRadius: 8,
  },
  errorButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});
