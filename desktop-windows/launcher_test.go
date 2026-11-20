package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestFixedOfficialURL(t *testing.T) {
	if officialURL!="https://kuo-code-tw.github.io/smart-punch/" {t.Fatal("official URL changed")}
	if !strings.HasPrefix(officialURL,"https://"){t.Fatal("HTTPS is required")}
}

func TestSafeBrowserArgs(t *testing.T) {
	profile:=filepath.Join("C:","Users","tester","AppData","Local","Port79CloudSystem","EdgeProfile")
	args:=edgeArgs(profile)
	if len(args)!=3||args[0]!="--app="+officialURL||args[1]!="--user-data-dir="+profile||args[2]!="--no-first-run" {
		t.Fatalf("args mismatch: %#v",args)
	}
	for _,a:=range args {
		if strings.Contains(a,"disable-web-security")||strings.Contains(a,"ignore-certificate-errors") {
			t.Fatal("insecure Chromium argument")
		}
	}
}

func TestSeparateLocalProfile(t *testing.T) {
	env:=func(k string)string{if k=="LOCALAPPDATA"{return "C:\\Users\\tester\\AppData\\Local"};return ""}
	p,err:=appProfileDir(env)
	if err!=nil||!strings.Contains(p,"Port79CloudSystem")||!strings.HasSuffix(p,"EdgeProfile"){t.Fatalf("unexpected path %s: %v",p,err)}
	if _,err:=appProfileDir(func(string)string{return ""});err==nil{t.Fatal("local storage path must not silently fall back")}
}

func TestInstalledEdgeAndFailure(t *testing.T){
	env:=func(k string)string {if k=="PROGRAMFILES"{return "C:\\Program Files"};return ""}
	want:=filepath.Join(env("PROGRAMFILES"),"Microsoft","Edge","Application","msedge.exe")
	stat:=func(path string)(os.FileInfo,error){if path==want{return fakeInfo{},nil};return nil,os.ErrNotExist}
	got,err:=findEdge(env,stat,func(string)(string,error){return "",errors.New("missing")})
	if err!=nil||got!=want {t.Fatalf("Edge selection: %s %v",got,err)}
	_,err=findEdge(func(string)string{return ""},func(string)(os.FileInfo,error){return nil,os.ErrNotExist},func(string)(string,error){return "",errors.New("missing")})
	if err==nil{t.Fatal("no installed browser must return error")}
}

type fakeInfo struct{}
func (fakeInfo) Name()string{return "msedge.exe"}
func (fakeInfo) Size()int64{return 1}
func (fakeInfo) Mode()os.FileMode{return 0755}
func (fakeInfo) ModTime()time.Time{return time.Time{}}
func (fakeInfo) IsDir()bool{return false}
func (fakeInfo) Sys()any{return nil}
