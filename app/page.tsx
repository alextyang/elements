"use client";

import Image from "next/image";
import styles from "./page.module.css";

import { Input } from "@/components/input/input";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { isValidURL } from "./domain/search";
import { Bookmarks } from "@/components/bookmarks/bookmarks";
import { Background } from "@/components/backgrounds/background";

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
      <Background />
      <Input text={inputText} setText={setInputText} submitInput={submitInput}></Input>
      <Bookmarks searchText={inputText} setSelectedBookmark={setSelectedBookmark} />
    </div>
  );
}
