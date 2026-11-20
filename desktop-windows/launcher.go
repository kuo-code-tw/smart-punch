// Package main is an auditable Windows launcher for the unchanged official 79號碼頭 system.
package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const officialURL = "https://kuo-code-tw.github.io/smart-punch/"
const profileDirName = "Port79CloudSystem"

func edgeCandidates(env func(string) string) []string {
	dirs := []string{env("PROGRAMFILES"), env("PROGRAMFILES(X86)"), env("LOCALAPPDATA")}
	var out []string
	seen := make(map[string]bool)
	for _, dir := range dirs {
		if dir == "" { continue }
		path := filepath.Join(dir, "Microsoft", "Edge", "Application", "msedge.exe")
		key := strings.ToLower(path)
		if !seen[key] { out=append(out,path); seen[key]=true }
	}
	return out
}

func findEdge(env func(string) string, stat func(string) (os.FileInfo, error), lookPath func(string) (string,error)) (string,error) {
	for _, file := range edgeCandidates(env) {
		if info, err := stat(file); err == nil && !info.IsDir() { return file,nil }
	}
	if path, err := lookPath("msedge.exe"); err == nil {return path,nil}
	return "", errors.New("找不到 Microsoft Edge。請先安裝或更新 Microsoft Edge，再啟動 79 號碼頭系統。")
}

func appProfileDir(env func(string)string) (string,error) {
	base := env("LOCALAPPDATA")
	if base == "" { return "",errors.New("無法找到 Windows 本機應用程式資料夾 LOCALAPPDATA") }
	return filepath.Join(base,profileDirName,"EdgeProfile"),nil
}

func edgeArgs(profile string) []string {
	// Official site loads unchanged, including its original permissions and APIs.
	// A dedicated local profile avoids editing the user's existing browser cache.
	return []string{"--app="+officialURL,"--user-data-dir="+profile,"--no-first-run"}
}

func startEdge() error {
	exe,err := findEdge(os.Getenv,os.Stat,exec.LookPath)
	if err!=nil {return err}
	profile,err := appProfileDir(os.Getenv)
	if err!=nil {return err}
	if err=os.MkdirAll(profile,0700);err!=nil {return err}
	cmd:=exec.Command(exe,edgeArgs(profile)...)
	if err=cmd.Start();err!=nil{return err}
	return cmd.Process.Release()
}
