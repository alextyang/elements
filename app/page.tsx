"use client";

import Image from "next/image";
import styles from "./page.module.css";

import { Input } from "@/components/input/input";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { isValidURL } from "./domain/search";

export default function Home() {
  const router = useRouter();
  const [inputText, setInputText] = useState("");
  const [selectedBookmark, setSelectedBookmark] = useState(null);

  const submitInput = () => {

    // TODO: Check for a valid bookmark

    if (isValidURL(inputText)) {
      console.log("Opening URL...");
      router.replace(inputText);
    } else {
      console.log("Searching...");
      router.replace("https://www.google.com/search?q=" + inputText);
    }

  };

  return (
    <div className={styles.content}>
      <div className={styles.background}></div>
      <Input text={inputText} setText={setInputText} submitInput={submitInput}></Input>
    </div>
  );
}
