declare global {
    namespace NodeJS {
        interface ProcessEnv {
            TARGET?: string;
        }
    }
}

export {};
