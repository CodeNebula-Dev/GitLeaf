#!/usr/bin/env bash

# GitLeaf One-Script Installer & Setup Wizard for macOS / Linux / WSL
# https://github.com/CodeNebula-Dev/GitLeaf

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Determine current script directory
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

print_header() {
  echo -e "${CYAN}"
  echo "╭─────────────────────────────────────────────────────────────────────────────╮"
  echo "│                                                                             │"
  echo "│   GitLeaf One-Script Automated Installer & Setup Guide                      │"
  echo "│   Local-First Collaborative LaTeX Platform                                  │"
  echo "│                                                                             │"
  echo "╰─────────────────────────────────────────────────────────────────────────────╯"
  echo -e "${NC}"
}

guide_install_node() {
  echo -e "\n${RED}${BOLD}✖ Node.js was not detected on your system!${NC}"
  echo -e "${YELLOW}GitLeaf requires Node.js (version 18 or higher) to run.${NC}\n"
  
  OS="$(uname -s)"
  case "$OS" in
    Darwin*)
      echo -e "${BOLD}Recommended installation options for macOS:${NC}\n"
      if command -v brew >/dev/null 2>&1; then
        echo -e "  ${GREEN}✔ Homebrew package manager detected!${NC}"
        read -p "  Would you like to install Node.js now via Homebrew? (y/N): " choice
        case "$choice" in 
          y|Y|yes|Yes )
            echo -e "\n${CYAN}Running: brew install node ...${NC}"
            brew install node
            echo -e "${GREEN}✔ Node.js installed successfully! Resuming setup...${NC}\n"
            return 0
            ;;
          * )
            echo -e "\nYou can manually run: ${CYAN}brew install node${NC}"
            ;;
        esac
      else
        echo -e "  1. ${BOLD}Via Homebrew:${NC}"
        echo -e "     First install Homebrew: ${CYAN}/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"${NC}"
        echo -e "     Then run:               ${CYAN}brew install node${NC}"
      fi
      echo -e "\n  2. ${BOLD}Via Official Installer (Easiest):${NC}"
      echo -e "     Download & run the macOS package from: ${CYAN}https://nodejs.org/${NC}"
      echo -e "\n  3. ${BOLD}Via NVM (Node Version Manager):${NC}"
      echo -e "     ${CYAN}curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash${NC}"
      echo -e "     ${CYAN}nvm install 20${NC}"
      ;;
    Linux*)
      echo -e "${BOLD}Recommended installation options for Linux:${NC}\n"
      if [ -f /etc/debian_version ]; then
        echo -e "  ${BOLD}Ubuntu / Debian / Mint:${NC}"
        echo -e "     ${CYAN}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -${NC}"
        echo -e "     ${CYAN}sudo apt-get install -y nodejs${NC}"
      elif [ -f /etc/arch-release ]; then
        echo -e "  ${BOLD}Arch Linux / Manjaro:${NC}"
        echo -e "     ${CYAN}sudo pacman -S nodejs npm${NC}"
      elif [ -f /etc/fedora-release ] || [ -f /etc/redhat-release ]; then
        echo -e "  ${BOLD}Fedora / RHEL / CentOS:${NC}"
        echo -e "     ${CYAN}sudo dnf install nodejs${NC}"
      else
        echo -e "  ${BOLD}Via NodeSource:${NC}"
        echo -e "     ${CYAN}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -${NC}"
        echo -e "     ${CYAN}sudo apt-get install -y nodejs${NC}"
      fi
      echo -e "\n  ${BOLD}Or via NVM (universal):${NC}"
      echo -e "     ${CYAN}curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash${NC}"
      echo -e "     ${CYAN}nvm install 20${NC}"
      ;;
    *)
      echo -e "Please download and install Node.js (>= 18) from: ${CYAN}https://nodejs.org/${NC}"
      ;;
  esac

  echo -e "\n${YELLOW}After installing Node.js, simply re-run this setup script:${NC}"
  echo -e "  ${CYAN}./setup.sh${NC}\n"
  exit 1
}

check_node_version() {
  NODE_VER=$(node -v | sed 's/^v//')
  MAJOR_VER=$(echo "$NODE_VER" | cut -d. -f1)
  if [ "$MAJOR_VER" -lt 18 ]; then
    echo -e "\n${RED}${BOLD}✖ Node.js version $NODE_VER is too old!${NC}"
    echo -e "${YELLOW}GitLeaf requires Node.js >= 18.0.0. Please upgrade Node.js and re-run ./setup.sh.${NC}\n"
    exit 1
  fi
}

# --- Main Flow ---
print_header

# 1. Check if Node is installed
if ! command -v node >/dev/null 2>&1; then
  guide_install_node
fi

# 2. Check Node version
check_node_version

# 3. Ensure scripts/setup.mjs exists and invoke it
if [ -f "$DIR/scripts/setup.mjs" ]; then
  node "$DIR/scripts/setup.mjs" "$@"
else
  echo -e "${RED}Error: scripts/setup.mjs was not found in $DIR/scripts/${NC}"
  exit 1
fi
