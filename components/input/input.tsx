"use client";

import { CSSProperties, useEffect } from "react";
import styles from "./input.module.css";

export function Input({ text, setText, submitInput }: Readonly<{ text: string, setText: (text: string) => void, submitInput: () => void }>) {
    const emptyStyle = text.trim().length === 0 ? {
        borderColor: 'var(--foreground)'
    } : {} as CSSProperties;

    // Focus the input on load
    useEffect(() => {
        const input = document.getElementById("defaultInput");
        if (input) {
            input.focus();
        }

        const captureFocus = () => {
            if (document.activeElement?.tagName !== "INPUT")
                document.getElementById("defaultInput")?.focus();
        }

        window.addEventListener("keydown", captureFocus);

        return () => {
            window.removeEventListener("keydown", captureFocus);
        }
    }, []);

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            submitInput();
        }
    }

    const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setText(event.target.value.replaceAll("+", "%2B").trim());
    }

    return (
        <input id="defaultInput" className={styles.input} style={emptyStyle} type="text" onChange={onChange} onKeyDown={onKeyDown} />
    );
}
