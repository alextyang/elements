"use client";

import { useEffect, useState } from "react";
import styles from "./sky.module.css";
import suncalc from "suncalc";

export function Sky({ }) {
    const [gradient, setGradient] = useState<string>('');


    useEffect(() => {
        const pickGradient = () => {
            const hour = (new Date()).getHours();
            const colors = grads[hour % grads.length];

            var css = "linear-gradient(175deg, " + "#" + colors[0].color + " 0%, ";
            var len = colors.length;
            const offset = 10;

            for (var i = 0; i < len; i++) {
                var item = colors[i];
                css += " #" + item.color + " " + (item.position + offset) + "%";
                if (i < len - 1) css += ",";
            }
            const gradient = css + ")";
            setGradient(gradient);
            document?.getElementById("theme-color")?.setAttribute('content', '#' + banner[hour].color);
        }

        const interval = setInterval(pickGradient, 1000 * 60 * 5);
        pickGradient();

        return () => {
            clearInterval(interval);
        }
    }, []);


    return (
        <div id="sky" className={styles.background} style={{ background: gradient }} />
    );
}


// gradient colors from https://cdpn.io/rDEAl
const grads: {
    color: string;
    position: number;
}[][] = [
        [{ color: "010A10", position: 30 }, { color: "59230B", position: 80 }, { color: "2F1107", position: 100 }],
        [{ color: "090401", position: 50 }, { color: "4B1D06", position: 100 }],
        [{ color: "00000c", position: 80 }, { color: "150800", position: 100 }],
        [{ color: "00000c", position: 0 }, { color: "00000c", position: 0 }],
        [{ color: "020111", position: 85 }, { color: "191621", position: 100 }],
        [{ color: "020111", position: 60 }, { color: "20202c", position: 100 }],
        [{ color: "020111", position: 10 }, { color: "3a3a52", position: 100 }],
        [{ color: "20202c", position: 0 }, { color: "515175", position: 100 }],
        [{ color: "40405c", position: 0 }, { color: "6f71aa", position: 80 }, { color: "8a76ab", position: 100 }],
        [{ color: "4a4969", position: 0 }, { color: "7072ab", position: 50 }, { color: "cd82a0", position: 100 }],
        [{ color: "757abf", position: 0 }, { color: "8583be", position: 60 }, { color: "eab0d1", position: 100 }],
        [{ color: "82addb", position: 0 }, { color: "ebb2b1", position: 100 }],
        [{ color: "94c5f8", position: 1 }, { color: "a6e6ff", position: 70 }, { color: "b1b5ea", position: 100 }],
        [{ color: "b7eaff", position: 0 }, { color: "94dfff", position: 100 }],
        [{ color: "9be2fe", position: 0 }, { color: "67d1fb", position: 100 }],
        [{ color: "90dffe", position: 0 }, { color: "38a3d1", position: 100 }],
        [{ color: "57c1eb", position: 0 }, { color: "246fa8", position: 100 }],
        [{ color: "2d91c2", position: 0 }, { color: "1e528e", position: 100 }],
        [{ color: "2473ab", position: 0 }, { color: "1e528e", position: 70 }, { color: "5b7983", position: 100 }],
        [{ color: "1e528e", position: 0 }, { color: "265889", position: 50 }, { color: "9da671", position: 100 }],
        [{ color: "1e528e", position: 0 }, { color: "728a7c", position: 50 }, { color: "e9ce5d", position: 100 }],
        [{ color: "154277", position: 0 }, { color: "576e71", position: 30 }, { color: "e1c45e", position: 70 }, { color: "b26339", position: 100 }],
        [{ color: "163C52", position: 0 }, { color: "4F4F47", position: 30 }, { color: "C5752D", position: 60 }, { color: "B7490F", position: 80 }, { color: "2F1107", position: 100 }],
        [{ color: "071B26", position: 0 }, { color: "071B26", position: 30 }, { color: "8A3B12", position: 80 }, { color: "240E03", position: 100 }],
    ];

const banner = [
    { color: "030405" },
    { color: "090401" },
    { color: "00000c" },
    { color: "00000c" },
    { color: "020111" },
    { color: "020111" },
    { color: "020111" },
    { color: "20202c" },
    { color: "40405c" },
    { color: "4a4969" },
    { color: "757abf" },
    { color: "82addb" },
    { color: "94c5f8" },
    { color: "b7eaff" },
    { color: "9be2fe" },
    { color: "90dffe" },
    { color: "57c1eb" },
    { color: "2d91c2" },
    { color: "2473ab" },
    { color: "1e528e" },
    { color: "1e528e" },
    { color: "154277" },
    { color: "163C52" },
    { color: "071B26" },
];