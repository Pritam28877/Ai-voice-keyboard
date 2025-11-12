# Overview

Hello and welcome to our Full Stack Developer Take-Home Assignment. In this document, we explore building an AI voice keyboard app, which allows the user to speak into the microphone and get their messages converted into well-formatted text. They can then copy and paste this into whatever apps they are using.

By the end of this assignment, you should have built a fully functional voice keyboard app that saves users a lot of time by replacing typing with speaking. The goal of this assignment is to evaluate your ability to problem-solve, create beautiful design and user experience, and apply technology to solving real-world problems.

The estimated time for this assignment is `90 minutes`. Everything you need to know to complete this assignment successfully is in this document. 

Good luck and have fun!

# Product Requirements

## Problem

Typing is slow, and speaking is faster. Most people don't use dictation because traditional dictation software cannot understand user intent and content context. This results in very low-quality, irrelevant words being transcribed into text that can't be directly used.

Modern AI large language model-based solutions, such as OpenAI's Whisper API, can already achieve very good results in converting voices into complete sentences. This allows developers to provide custom prompts that make the output text more well-formatted in a way that is suitable for the situation.

However, transcribing long audio files, such as a 5-minute or 10-minute Dictation session, can be very inefficient. The most naive and basic solution is to first record the whole session of user speaking and then upload the voice as a sound file into cloud storage. Finally, call the Whisper API or equivalent Voice-to-Text API to transcribe the entire file into text, given some system prompts that consider the user's use case or any other relevant context. 

This process is extremely slow and can result in a bad user experience and long wait times.

## Solution

We propose sound clip slicing as the solution to this problem. Rather than recording the whole session and only uploading the entire audio file to the API after a user completes dictation, we use slicing with a buffer to incrementally stream the audio file to be processed by an AI model.

This continuously merges existing slices with the latest slice to create the complete text transcription. This means the maximum delay of getting the whole text result after the dictation session finishes is just the time it takes to process the final 5-second slice and merge results into the final sentence.

## Product

We are building an MVP-style minimalistic web application. Users can sign in with email and password authentication. After that, they can click a button to start transcribing their voice into text. Users just need to speak into the microphone, and the transcribed text will be processed in the background. After the user finishes dictating and ends the transcription session, the resulting text is quickly shown on the screen.

The list of all transcribed text should be stored in a database and displayed to the user with the latest on top. When a user hovers on any text, they should be able to one-click to copy the transcribed text to the clipboard.

A secondary feature is a dictionary page where the user can input a list of keywords or special spellings, which the transcription AI will take into account. This means if you have a special spelling for a word that you think the AI typically gets wrong, you can simply define the word or phrase in the dictionary. These words are then fed into the transcribing AI to spell things correctly.



## Features

- User login
    
    User should be able to sign up with email, password, name, and login with email password. 
    
    Resetting password is out of scope.
    
- Navigation
    
    Use a side-bar navigation, allowing logged in user to switch to different tabs of the web app.
    
- Dictation
    
    User should be able to click a button to start transcribing easily, and stop the transcription if they press again.
    
- Dictionary
    
    User should be able to create / update / delete / list the dictionary of special words.
    
- Settings
    
    Any necessary settings.


    ## Tech Stack

- Next.js for both frontend and APIs
- ShadCN for most standard UI components
- Postgres database
- [Railway](https://railway.com) for hosting everything (including both the web app and database)
- You can use any LLM APIs as you see fit

## UI Design

Clean, modern, minimalistic aesthetics. Production quality UI, layout, transition, etc. with no obvious defects. 

## Similar Concepts

For comparable products, you can take a look at:

- Wispr Flow
- Typeless.com

# Deliverables

- A fully working app hosted on Railway
- A recorded demo video of the product
- Source code hosted on a public GitHub repository


# Evaluation

Your work will be evaluated on the following aspects:



Criteria	Description
Functionality	How well the app implements all the required functionality and solves the user problem completely.
UI Design	How good the UI design is and if it's aesthetically pleasing, beautiful, clean, modern, and free from clustering and visual defects.
User Experience	How easy and intuitive it is to use the product. It measures the ability to think in users' shoes and create a smooth, productive user experience that leaves a smile on their face.
Performance	Measured by the reliability and latency when transcribing a one-minute or longer dictation session.
Code Quality	How well organized the codebase is and how well the functions are written. Use minimal SEO code to solve the problem, ensuring the code has great maintainability and decomposition.



reffer code 
/**
 * Utility functions for audio processing in Gemini Live API
 */

/**
 * Decodes base64 audio data to Uint8Array
 */
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes audio data into an AudioBuffer
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(
    numChannels,
    data.length / 2 / numChannels,
    sampleRate
  );

  const dataInt16 = new Int16Array(data.buffer);
  const l = dataInt16.length;
  const dataFloat32 = new Float32Array(l);

  for (let i = 0; i < l; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0;
  }

  // Extract interleaved channels
  if (numChannels === 1) {
    buffer.copyToChannel(dataFloat32, 0);
  } else {
    for (let i = 0; i < numChannels; i++) {
      const channel = dataFloat32.filter(
        (_, index) => index % numChannels === i
      );
      buffer.copyToChannel(channel, i);
    }
  }

  return buffer;
}

/**
 * Creates a base64-encoded blob data from PCM audio for sending to Gemini API
 */
export async function createBlobData(pcmData: Float32Array): Promise<string> {
  const l = pcmData.length;
  const int16 = new Int16Array(l);

  // Convert float32 (-1 to 1) to int16 (-32768 to 32767)
  for (let i = 0; i < l; i++) {
    int16[i] = pcmData[i] * 32768;
  }

  // Convert to base64
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Creates audio data in the format expected by Gemini Live API
 * Returns an object with base64 data and mimeType (not a browser Blob!)
 */
export function createAudioData(pcmData: Float32Array): {
  data: string;
  mimeType: string;
} {
  const l = pcmData.length;
  const int16 = new Int16Array(l);

  // Convert float32 (-1 to 1) to int16 (-32768 to 32767)
  for (let i = 0; i < l; i++) {
    int16[i] = pcmData[i] * 32768;
  }

  // Convert to base64
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    data: base64,
    mimeType: "audio/pcm;rate=16000",
  };
}

/**
 * Creates a blob from PCM audio data for Gemini Live API
 */
export function createBlob(pcmData: Float32Array): Blob {
  const l = pcmData.length;
  const int16 = new Int16Array(l);

  // Convert float32 (-1 to 1) to int16 (-32768 to 32767)
  for (let i = 0; i < l; i++) {
    int16[i] = pcmData[i] * 32768;
  }

  return new Blob([int16.buffer], { type: "audio/pcm;rate=16000" });
}

/**
 * Simple Voice Activity Detection (VAD)
 * Returns true if audio volume is above threshold
 */
export function detectVoiceActivity(
  audioData: Float32Array,
  threshold: number = 0.01
): boolean {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += Math.abs(audioData[i]);
  }
  const average = sum / audioData.length;
  return average > threshold;
}

/**
 * Calculate RMS (Root Mean Square) of audio data
 */
export function calculateRMS(audioData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  return Math.sqrt(sum / audioData.length);
}

import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  audioLevel: number;
  isRecording: boolean;
}

export function AudioVisualizer({
  audioLevel,
  isRecording,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw background circle
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 80, 0, Math.PI * 2);
      ctx.fillStyle = isRecording
        ? "rgba(239, 68, 68, 0.1)"
        : "rgba(59, 130, 246, 0.1)";
      ctx.fill();

      // Draw animated rings based on audio level
      if (isRecording) {
        const numRings = 3;
        for (let i = 0; i < numRings; i++) {
          const progress = (Date.now() / 1000 + i * 0.3) % 1;
          const radius = 80 + progress * 60;
          const opacity = (1 - progress) * (audioLevel / 100) * 0.5;

          ctx.beginPath();
          ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${opacity})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }

      // Draw center circle (pulsing with audio level)
      const scale = 1 + (audioLevel / 100) * 0.3;
      const centerRadius = 60 * scale;

      ctx.beginPath();
      ctx.arc(width / 2, height / 2, centerRadius, 0, Math.PI * 2);
      ctx.fillStyle = isRecording ? "#ef4444" : "#3b82f6";
      ctx.fill();

      // Draw microphone icon (simple representation)
      ctx.fillStyle = "white";
      ctx.fillRect(width / 2 - 8, height / 2 - 20, 16, 30);
      ctx.beginPath();
      ctx.arc(width / 2, height / 2 - 5, 8, 0, Math.PI * 2);
      ctx.fill();

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioLevel, isRecording]);

  return (
    <canvas ref={canvasRef} width={300} height={300} className="mx-auto" />
  );
}

